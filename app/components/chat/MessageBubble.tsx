"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Code2, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/app/hooks/useChat";
import type { MorphicError } from "@/packages/engine";
import { ReasoningPanel } from "./ReasoningPanel";

const UiResponse = dynamic(
  () => import("./UiResponse").then((module) => module.UiResponse),
  { ssr: false }
);

interface Props {
  message: ChatMessage;
  onSendMessage?: (content: string) => void;
}

function ThinkingDots(): ReactNode {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Generating response">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
    </div>
  );
}

function ActionBar({ content, mode }: { content: string; mode: "ui" | "text" }): ReactNode {
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <ActionBtn onClick={() => void copyToClipboard()} label={copied ? "Copied" : "Copy"}>
          <Copy className="h-3.5 w-3.5" />
        </ActionBtn>
        {mode === "ui" && (
          <ActionBtn
            label="View source"
            onClick={() => setShowSource((visible) => !visible)}
            active={showSource}
          >
            <Code2 className="h-3.5 w-3.5" />
          </ActionBtn>
        )}
      </div>
      {showSource && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
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
  onClick: () => void;
  label: string;
  active?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function AssistantMessage({ message, onSendMessage }: Props): ReactNode {
  const [hasRenderableUi, setHasRenderableUi] = useState(false);
  const [rendererErrors, setRendererErrors] = useState<MorphicError[]>([]);
  const [renderFailed, setRenderFailed] = useState(false);
  const hasRenderableContent =
    message.mode === "text" ? message.content.length > 0 : hasRenderableUi;

  const handleRendererErrors = useCallback((errors: MorphicError[]) => {
    setRendererErrors(errors);
  }, []);

  useEffect(() => {
    if (
      message.mode !== "ui" ||
      message.isStreaming ||
      !message.content ||
      hasRenderableUi
    ) {
      return;
    }

    const timer = window.setTimeout(() => setRenderFailed(true), 0);
    return () => window.clearTimeout(timer);
  }, [hasRenderableUi, message.content, message.isStreaming, message.mode]);

  return (
    <div className="group flex w-full flex-col gap-1">
      <ReasoningPanel message={message} hasRenderableContent={hasRenderableContent} />
      {message.isStreaming && !message.content ? null : message.mode === "ui" && message.content ? (
        <div className="w-full text-foreground">
          <UiResponse
            response={message.content}
            isStreaming={message.isStreaming}
            onError={handleRendererErrors}
            onFirstRenderable={() => setHasRenderableUi(true)}
            onSendMessage={onSendMessage}
          />
        </div>
      ) : (
        <div className="prose prose-sm prose-invert max-w-none leading-relaxed text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {message.content}
          </ReactMarkdown>
          {message.isStreaming && <ThinkingDots />}
        </div>
      )}

      {renderFailed && !hasRenderableUi && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The generated interface could not be rendered. Please retry or use View source to inspect the response.
            {rendererErrors[0]?.message ? ` ${rendererErrors[0].message}` : ""}
          </span>
        </div>
      )}

      {message.error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{message.error}</span>
        </div>
      )}

      {!message.isStreaming && message.content && (
        <ActionBar content={message.content} mode={message.mode} />
      )}
    </div>
  );
}

function MessageBubbleComponent({ message, onSendMessage }: Props): ReactNode {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <AssistantMessage
      key={message.contentRevision ?? 0}
      message={message}
      onSendMessage={onSendMessage}
    />
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
