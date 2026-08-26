"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { BarChart2, Layers, TableIcon, SlidersHorizontal } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "@/app/hooks/useChat";

interface Props {
  messages: ChatMessage[];
  onSuggestion?: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: BarChart2,         label: "Revenue dashboard" },
  { icon: Layers,            label: "Portfolio comparison" },
  { icon: TableIcon,         label: "Data table with filters" },
  { icon: SlidersHorizontal, label: "Interactive form" },
];

export function ChatWindow({ messages, onSuggestion }: Props): ReactNode {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const isStreaming = messages.some((message) => message.isStreaming);
      bottomRef.current?.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center px-4">
        {/* Logo mark */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary">
              <path d="M4 5h16M4 12h10M4 19h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M18 15l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground tracking-tight">What would you like to build?</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Describe a dashboard, analysis, or form — I&apos;ll generate the UI instantly.
            </p>
          </div>
        </div>

        {/* Suggestion chips */}
        <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
          {SUGGESTIONS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => onSuggestion?.(label)}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-card border border-border text-left text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent transition-all group"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 group-hover:text-primary transition-colors" />
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8">
      <div className="mx-auto max-w-4xl flex flex-col gap-10">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
