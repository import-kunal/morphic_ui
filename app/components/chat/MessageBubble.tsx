"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, Copy, ThumbsUp, ThumbsDown, RefreshCw, Code2 } from "lucide-react";
import { MorphicRenderer } from "@/packages/renderer";
import { MorphicEngine } from "@/packages/engine";
import { morphicLibrary } from "@/packages/elements";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ChatMessage } from "@/app/hooks/useChat";

interface Props {
  message: ChatMessage;
  mode: "ui" | "text";
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

function splitStreamError(raw: string): { morphicContent: string; streamError: string | null } {
  const marker = "\n\nError:";
  const idx = raw.lastIndexOf(marker);
  if (idx < 0) return { morphicContent: raw, streamError: null };
  return {
    morphicContent: raw.slice(0, idx).trimEnd(),
    streamError: raw.slice(idx + 2).trim(),
  };
}

export function MessageBubble({ message, mode }: Props): ReactNode {
  const engine = useMemo(() => new MorphicEngine({ library: morphicLibrary }), []);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const { morphicContent, streamError } = splitStreamError(message.content);

  return (
    <div className="group flex flex-col gap-1 w-full">
      {message.isStreaming && !message.content ? (
        <ThinkingDots />
      ) : mode === "ui" && morphicContent ? (
        /* UI mode: full-width rendered component, no card wrapper */
        <div className="w-full text-foreground">
          <MorphicRenderer
            engine={engine}
            response={morphicContent}
            isStreaming={message.isStreaming}
          />
        </div>
      ) : (
        /* Text mode: prose container */
        <div className="prose prose-sm prose-invert max-w-none text-foreground/90 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {morphicContent}
          </ReactMarkdown>
          {message.isStreaming && <ThinkingDots />}
        </div>
      )}

      {streamError && (
        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{streamError}</span>
        </div>
      )}

      {!message.isStreaming && morphicContent && (
        <ActionBar content={message.content} mode={mode} />
      )}
    </div>
  );
}
