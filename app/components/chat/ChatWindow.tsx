"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Scale, ShieldCheck, PieChart, Users } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "@/app/hooks/useChat";

interface Props {
  messages: ChatMessage[];
  onSuggestion?: (text: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Scale,
    label: "Compare two funds",
    detail: "PPFAS vs HDFC Flexi Cap",
    prompt:
      "Compare Parag Parikh Flexi Cap Fund and HDFC Flexi Cap Fund using the latest comparable fund-level data.",
  },
  {
    icon: ShieldCheck,
    label: "Review risk metrics",
    detail: "Use comparable plans and periods",
    prompt:
      "Compare the latest available risk metrics of Parag Parikh Flexi Cap Fund and HDFC Flexi Cap Fund. Keep plans and measurement periods comparable.",
  },
  {
    icon: PieChart,
    label: "Explore allocation",
    detail: "Market-cap composition",
    prompt:
      "Show the latest market-cap allocation of Parag Parikh Flexi Cap Fund, including the portfolio date and any unclassified or uncovered percentage.",
  },
  {
    icon: Users,
    label: "Check fund managers",
    detail: "Active team and tenure",
    prompt:
      "Who currently manages Parag Parikh Flexi Cap Fund? Show each active manager's tenure start date and educational qualification.",
  },
];

export function ChatWindow({ messages, onSuggestion }: Props): ReactNode {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages.at(-1);
  const lastTool = lastMessage?.toolActivity?.at(-1);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: lastMessage?.isStreaming ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    lastMessage?.content.length,
    lastMessage?.contentRevision,
    lastMessage?.error,
    lastMessage?.isStreaming,
    lastMessage?.reasoning?.length,
    lastMessage?.activityTimeline?.length,
    lastTool?.status,
  ]);

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
            <p className="text-lg font-semibold text-foreground tracking-tight">What would you like to research?</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Ask about funds, portfolios, managers, holdings, risk, or comparisons.
            </p>
          </div>
        </div>

        {/* Suggestion chips */}
        <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
          {SUGGESTIONS.map(({ icon: Icon, label, detail, prompt }) => (
            <button
              key={label}
              onClick={() => onSuggestion?.(prompt)}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-all hover:border-primary/30 hover:bg-accent"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground/90">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {detail}
                </span>
              </span>
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
          <MessageBubble key={msg.id} message={msg} onSendMessage={onSuggestion} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
