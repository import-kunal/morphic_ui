"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, ThumbsUp, ThumbsDown, RefreshCw, Code2 } from "lucide-react";
import { MorphicRenderer } from "@/packages/renderer";
import { MorphicEngine, type MorphicError } from "@/packages/engine";
import { morphicLibrary } from "@/packages/elements";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ChatMessage } from "@/app/hooks/useChat";
import { ReasoningPanel } from "./ReasoningPanel";

interface Props {
  message: ChatMessage;
}

function ThinkingDots(): ReactNode {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function ActionBar({ content, mode }: { content: string; mode: "ui" | "text" }): ReactNode {
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyToClipboard() {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionBtn onClick={copyToClipboard} label={copied ? "Copied" : "Copy"}>
          <Copy className="h-3.5 w-3.5" />
        </ActionBtn>
        <ActionBtn label="Good response"><ThumbsUp className="h-3.5 w-3.5" /></ActionBtn>
        <ActionBtn label="Bad response"><ThumbsDown className="h-3.5 w-3.5" /></ActionBtn>
        <ActionBtn label="Regenerate"><RefreshCw className="h-3.5 w-3.5" /></ActionBtn>
        {mode === "ui" && (
          <ActionBtn
            label="View source"
            onClick={() => setShowSource((v) => !v)}
            active={showSource}
          >
            <Code2 className="h-3.5 w-3.5" />
          </ActionBtn>
        )}
      </div>
      {showSource && (
        <pre className="text-xs text-muted-foreground bg-card rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono border border-border leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  label,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
}): ReactNode {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded-lg transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function MessageBubble({ message }: Props): ReactNode {
  const engine = useMemo(() => new MorphicEngine({ library: morphicLibrary }), []);
  const contentRevision = message.contentRevision ?? 0;
  const [renderedRevision, setRenderedRevision] = useState<number | null>(null);
  const [rendererErrors, setRendererErrors] = useState<MorphicError[]>([]);
  const [renderFailed, setRenderFailed] = useState(false);
  const hasRenderableUi = renderedRevision === contentRevision;
  const handleFirstRenderable = useCallback(
    () => setRenderedRevision(contentRevision),
    [contentRevision]
  );
  const handleRendererErrors = useCallback(
    (errors: MorphicError[]) => setRendererErrors(errors),
    []
  );

  useEffect(() => {
    setRendererErrors([]);
    setRenderFailed(false);
  }, [contentRevision]);

  useEffect(() => {
    if (
      message.mode !== "ui" ||
      message.isStreaming ||
      !message.content ||
      hasRenderableUi
    ) {
      setRenderFailed(false);
      return;
    }
    const timer = window.setTimeout(() => setRenderFailed(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasRenderableUi, message.content, message.isStreaming, message.mode]);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const hasRenderableContent =
    message.mode === "text" ? message.content.length > 0 : hasRenderableUi;

  return (
    <div className="group flex flex-col gap-1 w-full">
      <ReasoningPanel
        message={message}
        hasRenderableContent={hasRenderableContent}
      />
      {message.isStreaming && !message.content ? (
        null
      ) : message.mode === "ui" && message.content ? (
        /* UI mode: full-width rendered component, no card wrapper */
        <div className="w-full text-foreground">
          <MorphicRenderer
            key={contentRevision}
            engine={engine}
            response={message.content}
            isStreaming={message.isStreaming}
            onError={handleRendererErrors}
            onFirstRenderable={handleFirstRenderable}
          />
        </div>
      ) : (
        /* Text mode: prose container */
        <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {message.content}
          </ReactMarkdown>
          {message.isStreaming && <ThinkingDots />}
        </div>
      )}

      {renderFailed && (
        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            The generated interface could not be rendered. Please retry or use
            View source to inspect the response.
            {rendererErrors[0]?.message ? ` ${rendererErrors[0].message}` : ""}
          </span>
        </div>
      )}

      {message.error && (
        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{message.error}</span>
        </div>
      )}

      {!message.isStreaming && message.content && (
        <ActionBar content={message.content} mode={message.mode} />
      )}
    </div>
  );
}
