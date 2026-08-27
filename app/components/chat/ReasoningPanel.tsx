"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ChatActivityItem,
  ChatMessage,
} from "@/app/hooks/useChat";
import { cn } from "@/lib/utils";

interface ReasoningPanelProps {
  message: ChatMessage;
  hasRenderableContent: boolean;
}

type ToolActivity = NonNullable<ChatMessage["toolActivity"]>[number];
const EMPTY_TOOLS: ToolActivity[] = [];

interface ReasoningSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

type TimelineItem =
  | {
      id: string;
      type: "reasoning";
      heading: string;
      paragraphs: string[];
    }
  | {
      id: string;
      type: "tool";
      activity: ToolActivity;
    };

export function ReasoningPanel({
  message,
  hasRenderableContent,
}: ReasoningPanelProps): ReactNode {
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const isPreparing = message.isStreaming && !hasRenderableContent;
  const isExpanded = hasRenderableContent ? isManuallyOpen : true;
  const tools = message.toolActivity ?? EMPTY_TOOLS;
  const timeline = useMemo(
    () => buildTimeline(message.activityTimeline, tools, message.reasoning),
    [message.activityTimeline, message.reasoning, tools]
  );

  useEffect(() => {
    if (!isPreparing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isPreparing]);

  useEffect(() => {
    if (!isPreparing) return;
    const frame = window.requestAnimationFrame(() => {
      const container = timelineScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPreparing, message.activityTimeline, message.toolActivity]);

  const startedAt = message.preparationStartedAt ?? now;
  const elapsedMs =
    message.metrics?.timeToFirstTextMs ?? Math.max(0, now - startedAt);
  const completedChecks = tools.filter(
    (activity) => activity.status !== "running"
  ).length;
  const retries = tools.filter((activity) => activity.status === "error").length;
  const hasDetails = timeline.length > 0 || isPreparing;
  const latestTimelineItem = timeline.at(-1);
  const liveReasoningId =
    latestTimelineItem?.type === "reasoning"
      ? latestTimelineItem.id
      : undefined;
  const title = message.error
    ? "Research stopped"
    : isPreparing
      ? "Researching fund data"
      : "Researched fund data";
  const summary = buildHeaderSummary({
    elapsedMs,
    isPreparing,
    completedChecks,
    totalChecks: tools.length,
    retries,
  });

  return (
    <section className="mb-5 text-sm">
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-3 py-2 text-left",
          hasRenderableContent && hasDetails
            ? "cursor-pointer"
            : "cursor-default"
        )}
        aria-expanded={isExpanded}
        aria-controls={`research-details-${message.id}`}
        onClick={() => {
          if (hasRenderableContent && hasDetails) {
            setIsManuallyOpen((open) => !open);
          }
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium tracking-[-0.01em] text-muted-foreground transition-colors group-hover:text-foreground">
            {title}
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground/70">
            {summary}
          </span>
        </span>

        {hasRenderableContent && hasDetails && (
          <span className="shrink-0 text-xs text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
            {isExpanded ? "Hide activity" : "Show activity"}
          </span>
        )}
      </button>

      {isExpanded && hasDetails && (
        <div
          id={`research-details-${message.id}`}
          ref={timelineScrollRef}
          className={cn(
            "mt-1 max-h-[32rem] overflow-y-auto pr-2",
            "[scrollbar-color:transparent_transparent] [scrollbar-width:thin]",
            "hover:[scrollbar-color:var(--border)_transparent]",
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-transparent",
            "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
            "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50",
            "[&::-webkit-scrollbar-button]:hidden"
          )}
          aria-live="polite"
        >
          {timeline.length > 0 ? (
            <ol className="ml-1.5 border-l border-border/80 pl-5">
              {timeline.map((item) =>
                item.type === "tool" ? (
                  <ToolTimelineRow key={item.id} activity={item.activity} />
                ) : (
                  <ReasoningTimelineRow
                    key={item.id}
                    item={item}
                    isLive={isPreparing && item.id === liveReasoningId}
                  />
                )
              )}
            </ol>
          ) : (
            <ol className="ml-1.5 border-l border-border/80 pl-5">
              <li className="relative py-2.5">
                <TimelineDot status="running" />
                <p className="text-muted-foreground">
                  Understanding the request and selecting fund data
                </p>
              </li>
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function ToolTimelineRow({ activity }: { activity: ToolActivity }) {
  return (
    <li className="relative py-3">
      <TimelineDot status={activity.status} />
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <span className="font-medium text-foreground/90">
          {toolActionLabel(activity)}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {toolSummary(activity)}
        </span>
      </div>
    </li>
  );
}

function ReasoningTimelineRow({
  item,
  isLive,
}: {
  item: Extract<TimelineItem, { type: "reasoning" }>;
  isLive: boolean;
}) {
  return (
    <li className="relative py-3">
      <TimelineDot status={isLive ? "running" : "reasoning"} />
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="text-[13px] font-medium text-foreground/90">
          {item.heading}
        </h4>
        {isLive && (
          <span className="shrink-0 text-[11px] text-primary">Thinking</span>
        )}
      </div>
      {item.paragraphs.length > 0 ? (
        <div className="mt-1.5 space-y-2">
          {item.paragraphs.map((paragraph, index) => (
            <p
              key={`${item.id}-${index}`}
              className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : isLive ? (
        <p className="mt-1.5 animate-pulse text-xs text-muted-foreground/60">
          Thinking…
        </p>
      ) : null}
    </li>
  );
}

function TimelineDot({
  status,
}: {
  status: ToolActivity["status"] | "reasoning";
}) {
  return (
    <span
      className={cn(
        "absolute -left-[1.47rem] top-[1.15rem] h-2 w-2 rounded-full border-2 border-background",
        status === "running" && "animate-pulse bg-primary",
        status === "finished" && "bg-muted-foreground/60",
        status === "reasoning" && "bg-primary/55",
        status === "error" && "bg-chart-3"
      )}
      aria-hidden="true"
    />
  );
}

function buildTimeline(
  activityTimeline: ChatActivityItem[] | undefined,
  tools: ToolActivity[],
  legacyReasoning?: string
): TimelineItem[] {
  const toolsById = new Map(tools.map((activity) => [activity.callId, activity]));
  const source = activityTimeline?.length
    ? activityTimeline
    : buildLegacyTimeline(tools, legacyReasoning);
  const timeline: TimelineItem[] = [];

  for (const item of source) {
    if (item.type === "tool") {
      const activity = toolsById.get(item.callId);
      if (activity) {
        timeline.push({ id: item.id, type: "tool", activity });
      }
      continue;
    }

    const sections = parseReasoningSections(item.text);
    sections.forEach((section) => {
      timeline.push({
        id: `${item.id}-${section.id}`,
        type: "reasoning",
        heading: section.heading,
        paragraphs: section.paragraphs,
      });
    });
  }

  return timeline;
}

function buildLegacyTimeline(
  tools: ToolActivity[],
  reasoning?: string
): ChatActivityItem[] {
  const timeline: ChatActivityItem[] = tools.map((activity) => ({
    id: `tool-${activity.callId}`,
    type: "tool",
    callId: activity.callId,
  }));
  if (reasoning) {
    timeline.push({ id: "reasoning-legacy", type: "reasoning", text: reasoning });
  }
  return timeline;
}

function toolActionLabel(activity: ToolActivity) {
  if (activity.title) return activity.title;

  const running = activity.status === "running";
  const failed = activity.status === "error";

  switch (activity.tool) {
    case "search_iqra_entities":
      return failed
        ? "Fund search failed"
        : running
          ? "Searching funds and plans"
          : "Searched funds and plans";
    case "query_iqra_data":
      return failed
        ? "Fund data request failed"
        : running
          ? "Reading fund records"
          : "Read fund records";
    case "analyze_iqra_data":
      return failed
        ? "Portfolio calculation failed"
        : running
          ? "Calculating portfolio metrics"
          : "Calculated portfolio metrics";
    default:
      return activity.tool
        .replaceAll("_", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function toolSummary(activity: ToolActivity) {
  const details: string[] = [];

  if (activity.rowCount !== undefined) {
    details.push(
      `${activity.rowCount.toLocaleString("en-IN")} ${activity.rowCount === 1 ? "record" : "records"}`
    );
  }
  if (activity.status === "running") {
    details.push("working");
  } else if (activity.status === "error") {
    details.push("failed");
  }
  if (activity.durationMs !== undefined) {
    details.push(formatElapsed(activity.durationMs));
  }

  return details.join(" · ") || "working";
}

function parseReasoningSections(reasoning: string): ReasoningSection[] {
  const source = reasoning.trim();
  if (!source) return [];

  const headingPattern = /(?:^|\n)\s*\*\*([^*\n]+)\*\*\s*(?=\n|$)/gm;
  const matches = [...source.matchAll(headingPattern)];

  if (matches.length === 0) {
    return [
      {
        id: "reasoning",
        heading: "Working through the request",
        paragraphs: toReasoningParagraphs(source),
      },
    ];
  }

  const sections: ReasoningSection[] = [];
  const leadingText = source.slice(0, matches[0].index).trim();
  if (leadingText) {
    sections.push({
      id: "introduction",
      heading: "Initial assessment",
      paragraphs: toReasoningParagraphs(leadingText),
    });
  }

  matches.forEach((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    const heading = cleanReasoningText(match[1]).replace(/\s+/g, " ");

    sections.push({
      id: `section-${match.index ?? index}`,
      heading: heading || "Reasoning",
      paragraphs: toReasoningParagraphs(source.slice(bodyStart, bodyEnd)),
    });
  });

  return sections;
}

function toReasoningParagraphs(value: string) {
  const cleaned = cleanReasoningText(value);
  if (!cleaned) return [];

  return cleaned
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function cleanReasoningText(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\\\s*$/gm, "")
    .trim();
}

function buildHeaderSummary({
  elapsedMs,
  isPreparing,
  completedChecks,
  totalChecks,
  retries,
}: {
  elapsedMs: number;
  isPreparing: boolean;
  completedChecks: number;
  totalChecks: number;
  retries: number;
}) {
  const details = [formatElapsed(elapsedMs)];

  if (totalChecks > 0) {
    details.push(
      isPreparing
        ? `${completedChecks} of ${totalChecks} checks complete`
        : `${totalChecks} ${totalChecks === 1 ? "check" : "checks"}`
    );
  }
  if (retries > 0) {
    details.push(`${retries} ${retries === 1 ? "retry" : "retries"}`);
  }

  return details.join(" · ");
}

function formatElapsed(valueMs: number) {
  if (valueMs < 1_000) return `${Math.round(valueMs)} ms`;
  return `${(valueMs / 1_000).toFixed(1)} s`;
}
