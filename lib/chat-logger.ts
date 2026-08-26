import { env } from "@/config/env";
import type { ChatMode } from "@/lib/chat-protocol";
import {
  CHAT_TIME_ZONE,
  toIstDisplayTime,
  toIstTimestamp,
} from "@/lib/time";

export interface ChatLogContext {
  requestId: string;
  mode: ChatMode;
}

type ChatLogLevel = "info" | "warn" | "error";

export function logChat(
  level: ChatLogLevel,
  event: string,
  context: ChatLogContext,
  details: Record<string, unknown>
) {
  const now = new Date();
  const timestamp = toIstTimestamp(now);
  const output =
    env.CHAT_LOG_FORMAT === "json"
      ? `[morphic-chat] ${JSON.stringify({
          timestamp,
          timeZone: CHAT_TIME_ZONE,
          event,
          requestId: context.requestId,
          mode: context.mode,
          ...details,
        })}`
      : formatPrettyLog(now, event, context, details);

  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

function formatPrettyLog(
  timestamp: Date,
  event: string,
  context: ChatLogContext,
  details: Record<string, unknown>
) {
  const prefix = `[MorphicUI][${toIstDisplayTime(timestamp)}][${context.mode.toUpperCase()}][${context.requestId}]`;

  switch (event) {
    case "request.accepted":
      return block(prefix, "▶ Request accepted", [
        row("Model", textValue(details, "model")),
        row("Thinking", textValue(details, "reasoningEffort").toUpperCase()),
        row(
          "Conversation",
          `${integerValue(details, "messages")} message(s) · ${formatCount(numberValue(details, "inputChars"))} chars`
        ),
        row(
          "System prompt",
          `${formatCount(numberValue(details, "systemPromptChars"))} chars`
        ),
        row(
          "Limits",
          `${formatDuration(numberValue(details, "timeoutMs"))} timeout · ${integerValue(details, "activeRequests")}/${integerValue(details, "concurrencyLimit")} active`
        ),
      ]);

    case "request.rejected":
      return block(prefix, "⚠ Request rejected", [
        row("Reason", humanize(textValue(details, "reason"))),
        optionalRow("Elapsed", durationValue(details, "totalMs")),
        optionalRow(
          "Capacity",
          capacityValue(details)
        ),
      ]);

    case "model.request.started":
      return `${prefix} ◷ Gemini request started (route setup ${formatDuration(numberValue(details, "elapsedMs"))})`;

    case "model.first_text":
      return `${prefix} ⚡ First output received after ${formatDuration(numberValue(details, "timeToFirstTextMs"))}`;

    case "model.first_reasoning":
      return `${prefix} ◇ Reasoning summary started after ${formatDuration(numberValue(details, "timeToFirstReasoningMs"))}`;

    case "model.stream.progress": {
      const textChunks = numberValue(details, "textChunks");
      if ((textChunks ?? 0) === 0) {
        return `${prefix} … Reasoning ${formatCount(numberValue(details, "reasoningChunks"))} summary chunks · ${formatCount(numberValue(details, "reasoningChars"))} chars`;
      }
      return `${prefix} … Streaming ${formatDuration(numberValue(details, "streamingMs"))} · ${formatCount(numberValue(details, "textChunks"))} text chunks · ${formatCount(numberValue(details, "outputChars"))} chars · last gap ${formatDuration(numberValue(details, "lastChunkGapMs"))}`;
    }

    case "model.stream.completed": {
      const totalMs = numberValue(details, "totalMs");
      const requestToModelMs = numberValue(details, "requestToModelMs");
      const timeToFirstTextMs = numberValue(details, "timeToFirstTextMs");
      const textStreamingMs = numberValue(details, "textStreamingMs");
      return block(prefix, `✓ Completed in ${formatDuration(totalMs)}`, [
        timingRow("Route setup", requestToModelMs, totalMs),
        timingRow("Model wait", timeToFirstTextMs, totalMs),
        optionalRow(
          "Reasoning span",
          durationValue(details, "reasoningToFirstTextMs")
        ),
        timingRow("Output stream", textStreamingMs, totalMs),
        row(
          "Thinking",
          `${textValue(details, "reasoningEffort").toUpperCase()} · ${formatCount(numberValue(details, "reasoningChars"))} summary chars · ${formatCount(numberValue(details, "reasoningChunks"))} chunks`
        ),
        row(
          "Output",
          `${formatCount(numberValue(details, "outputChars"))} chars · ${formatCount(numberValue(details, "textChunks"))} text chunks · ${formatRate(numberValue(details, "charsPerSecond"))}`
        ),
        row(
          "Chunk gaps",
          `${formatDuration(numberValue(details, "maxChunkGapMs"))} maximum`
        ),
        row(
          "Tokens",
          `${formatCount(numberValue(details, "inputTokens"))} in · ${formatCount(numberValue(details, "outputTokens"))} out · ${formatCount(numberValue(details, "totalTokens"))} total`
        ),
        row("Finish", textValue(details, "finishReason") || "unknown"),
      ]);
    }

    case "model.stream.failed":
      return block(prefix, `✗ Generation failed after ${formatDuration(numberValue(details, "totalMs"))}`, [
        row("Reason", humanize(textValue(details, "code"))),
        row(
          "Received",
          `${formatCount(numberValue(details, "outputChars"))} chars across ${formatCount(numberValue(details, "chunks"))} chunks`
        ),
        optionalRow("Error", errorMessage(details["error"])),
      ]);

    case "stream.cancelled":
      return `${prefix} ■ Stream cancelled after ${formatDuration(numberValue(details, "totalMs"))}`;

    default:
      return `${prefix} ${humanize(event)}`;
  }
}

function block(prefix: string, title: string, rows: Array<string | null>) {
  return [`${prefix} ${title}`, ...rows.filter((line): line is string => line !== null)].join("\n");
}

function row(label: string, value: string) {
  return `  ${label.padEnd(14)} ${value}`;
}

function optionalRow(label: string, value: string | null) {
  return value === null ? null : row(label, value);
}

function timingRow(label: string, valueMs: number | null, totalMs: number | null) {
  const percentage =
    valueMs !== null && totalMs !== null && totalMs > 0
      ? ` · ${Math.round((valueMs / totalMs) * 100)}%`
      : "";
  return row(label, `${formatDuration(valueMs)}${percentage}`);
}

function capacityValue(details: Record<string, unknown>) {
  const active = numberValue(details, "activeRequests");
  const limit = numberValue(details, "limit");
  return active === null || limit === null
    ? null
    : `${formatCount(active)}/${formatCount(limit)} active`;
}

function durationValue(details: Record<string, unknown>, key: string) {
  const value = numberValue(details, key);
  return value === null ? null : formatDuration(value);
}

function numberValue(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerValue(details: Record<string, unknown>, key: string) {
  const value = numberValue(details, key);
  return value === null ? "—" : Math.round(value).toLocaleString("en-US");
}

function textValue(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function formatDuration(valueMs: number | null) {
  if (valueMs === null) return "—";
  if (valueMs < 1_000) return `${Math.round(valueMs)} ms`;
  if (valueMs < 60_000) return `${(valueMs / 1_000).toFixed(2)} s`;
  const minutes = Math.floor(valueMs / 60_000);
  const seconds = ((valueMs % 60_000) / 1_000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatCount(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("en-US");
}

function formatRate(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("en-US")} chars/s`;
}

function humanize(value: string) {
  return value.replaceAll(/[._-]+/g, " ");
}

function errorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const error = value as Record<string, unknown>;
  const name = typeof error["name"] === "string" ? error["name"] : "Error";
  const message =
    typeof error["message"] === "string" ? error["message"] : "Unknown error";
  return `${name}: ${message}`;
}
