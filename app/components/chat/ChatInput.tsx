"use client";

import { useState, useRef, type ReactNode, type KeyboardEvent } from "react";
import { ArrowUp, Sparkles, Square, Type } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSend: (content: string) => void;
  isLoading: boolean;
  onStop: () => void;
  mode: "ui" | "text";
  onModeChange: (mode: "ui" | "text") => void;
}

export function ChatInput({ onSend, isLoading, onStop, mode, onModeChange }: Props): ReactNode {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const canSend = value.trim().length > 0 && !isLoading;

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="mx-auto max-w-4xl">
        <div
          className={cn(
            "relative rounded-2xl bg-card border transition-all duration-150",
            "shadow-[0_0_0_1px_var(--border)] shadow-lg",
            "focus-within:shadow-[0_0_0_1.5px_var(--ring)] focus-within:border-ring/60"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKey}
            rows={1}
            aria-label="Ask about a fund, manager, holding, or risk metric"
            placeholder="Ask about a fund, manager, holding, or risk metric..."
            disabled={isLoading}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none disabled:opacity-40 leading-relaxed"
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            {/* Mode toggle */}
            <button
              onClick={() => onModeChange(mode === "ui" ? "text" : "ui")}
              disabled={isLoading}
              aria-pressed={mode === "ui"}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
                mode === "ui"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent"
              )}
            >
              {mode === "ui"
                ? <Sparkles className="h-3 w-3" />
                : <Type className="h-3 w-3" />
              }
              {mode === "ui" ? "UI mode" : "Text mode"}
            </button>

            {/* Send button */}
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  canSend
                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                )}
                aria-label="Send"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
          Research results are factual drafts for MFD review.
        </p>
      </div>
    </div>
  );
}
