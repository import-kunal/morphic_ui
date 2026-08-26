"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import type { ChatMessage } from "@/app/hooks/useChat";

interface ReasoningPanelProps {
  message: ChatMessage;
  hasRenderableContent: boolean;
}

export function ReasoningPanel({
  message,
  hasRenderableContent,
}: ReasoningPanelProps): ReactNode {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isPreparing = message.isStreaming && !hasRenderableContent;
  const isExpanded = hasRenderableContent ? isManuallyOpen : true;

  useEffect(() => {
    if (!isPreparing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [isPreparing]);

  const startedAt = message.preparationStartedAt ?? now;
  const elapsedMs =
    message.metrics?.timeToFirstTextMs ?? Math.max(0, now - startedAt);
  const title = isPreparing
    ? message.mode === "ui"
      ? "Preparing your interface"
      : "Preparing your response"
    : `Prepared in ${formatElapsed(elapsedMs)}`;
  const reasoning = message.reasoning?.trim();

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/[0.04] text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-blue-500/[0.06]"
        aria-expanded={isExpanded}
        onClick={() => {
          if (hasRenderableContent) setIsManuallyOpen((open) => !open);
        }}
      >
        {isPreparing ? (
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
        ) : (
          <BrainCircuit className="h-4 w-4 shrink-0 text-blue-400" />
        )}
        <span className="min-w-0 flex-1 font-medium text-zinc-200">{title}</span>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {(message.reasoningEffort ?? message.metrics?.reasoningEffort ?? "low")}
        </span>
        {hasRenderableContent &&
          (isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
          ))}
      </button>

      {isExpanded && (
        <div
          className="border-t border-blue-500/15 px-4 py-3 text-xs leading-relaxed text-zinc-400"
          aria-live="polite"
        >
          {reasoning ? (
            <div className="max-h-44 overflow-y-auto whitespace-pre-wrap pr-2">
              {reasoning}
            </div>
          ) : (
            <p>Understanding your request and planning the response structure…</p>
          )}
        </div>
      )}
    </section>
  );
}

function formatElapsed(valueMs: number) {
  if (valueMs < 1_000) return `${Math.round(valueMs)} ms`;
  return `${(valueMs / 1_000).toFixed(1)} s`;
}
