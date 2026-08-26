import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { streamChatModel } from "@/lib/agent";
import { logChat, type ChatLogContext } from "@/lib/chat-logger";
import { toIstTimestamp } from "@/lib/time";
import type {
  ChatMode,
  ChatStreamEvent,
  ChatStreamMetrics,
} from "@/lib/chat-protocol";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(16_000),
});

const BodySchema = z
  .object({
    messages: z.array(MessageSchema).min(1).max(30),
  })
  .superRefine(({ messages }, context) => {
    const totalChars = messages.reduce(
      (sum, message) => sum + message.content.length,
      0
    );
    if (totalChars > 100_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: "Conversation history is too large",
      });
    }
  });

type ChatInput = z.infer<typeof BodySchema>;

interface ChatStreamOptions {
  mode: ChatMode;
  systemPrompt: string;
}

type RequestContext = ChatLogContext;

interface MutableMetrics {
  requestStartedAt: string;
  requestStartedMs: number;
  modelStartedAt: string;
  modelStartedMs: number;
  streamStartedAt: string | null;
  streamStartedMs: number | null;
  firstChunkAt: string | null;
  firstChunkMs: number | null;
  firstTextAt: string | null;
  firstTextMs: number | null;
  firstReasoningAt: string | null;
  firstReasoningMs: number | null;
  chunks: number;
  textChunks: number;
  reasoningChunks: number;
  outputChars: number;
  reasoningChars: number;
  lastChunkMs: number | null;
  maxChunkGapMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
}

let activeRequests = 0;

export async function handleChatStream(
  request: NextRequest,
  options: ChatStreamOptions
): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8);
  const context: RequestContext = { requestId, mode: options.mode };
  const requestStartedMs = performance.now();
  const requestStartedAt = toIstTimestamp();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    logChat("warn", "request.rejected", context, {
      reason: "invalid_json",
      totalMs: roundMs(performance.now() - requestStartedMs),
    });
    return Response.json(
      { error: "Request body must be valid JSON", requestId },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    logChat("warn", "request.rejected", context, {
      reason: "invalid_body",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      totalMs: roundMs(performance.now() - requestStartedMs),
    });
    return Response.json(
      { error: "Invalid request body", requestId },
      { status: 400 }
    );
  }

  if (activeRequests >= env.CHAT_MAX_CONCURRENT_REQUESTS) {
    logChat("warn", "request.rejected", context, {
      reason: "concurrency_limit",
      activeRequests,
      limit: env.CHAT_MAX_CONCURRENT_REQUESTS,
    });
    return Response.json(
      { error: "The service is busy. Please retry shortly.", requestId },
      { status: 429, headers: { "Retry-After": "2" } }
    );
  }

  activeRequests++;
  const inputChars = countInputChars(parsed.data);
  logChat("info", "request.accepted", context, {
    model: env.GEMINI_MODEL,
    reasoningEffort: env.GEMINI_REASONING_EFFORT,
    messages: parsed.data.messages.length,
    inputChars,
    systemPromptChars: options.systemPrompt.length,
    timeoutMs: env.CHAT_TIMEOUT_MS,
    activeRequests,
    concurrencyLimit: env.CHAT_MAX_CONCURRENT_REQUESTS,
  });

  const generationController = new AbortController();
  let timedOut = false;
  let clientAborted = false;
  let released = false;

  const releaseRequest = () => {
    if (released) return;
    released = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };

  const handleClientAbort = () => {
    clientAborted = true;
    generationController.abort(
      new DOMException("Client disconnected", "AbortError")
    );
  };

  if (request.signal.aborted) {
    handleClientAbort();
  } else {
    request.signal.addEventListener("abort", handleClientAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    generationController.abort(
      new DOMException("Generation timed out", "TimeoutError")
    );
  }, env.CHAT_TIMEOUT_MS);

  const encoder = new TextEncoder();
  let responseClosed = false;

  const responseStream = new ReadableStream<Uint8Array>({
    start(controller) {
      enqueueEvent(controller, encoder, {
        type: "start",
        requestId,
        model: env.GEMINI_MODEL,
        mode: options.mode,
        reasoningEffort: env.GEMINI_REASONING_EFFORT,
        requestStartedAt,
      });

      void pumpModelStream({
        controller,
        encoder,
        context,
        input: parsed.data,
        systemPrompt: options.systemPrompt,
        signal: generationController.signal,
        requestStartedAt,
        requestStartedMs,
        timedOut: () => timedOut,
        clientAborted: () => clientAborted,
      }).finally(() => {
        clearTimeout(timeoutId);
        request.signal.removeEventListener("abort", handleClientAbort);
        releaseRequest();
        if (!responseClosed) {
          responseClosed = true;
          try {
            controller.close();
          } catch {
            // The browser may already have cancelled the stream.
          }
        }
      });
    },
    cancel() {
      clientAborted = true;
      responseClosed = true;
      clearTimeout(timeoutId);
      generationController.abort(
        new DOMException("Response stream cancelled", "AbortError")
      );
      releaseRequest();
      logChat("warn", "stream.cancelled", context, {
        totalMs: roundMs(performance.now() - requestStartedMs),
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
    },
  });
}

async function pumpModelStream({
  controller,
  encoder,
  context,
  input,
  systemPrompt,
  signal,
  requestStartedAt,
  requestStartedMs,
  timedOut,
  clientAborted,
}: {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  context: RequestContext;
  input: ChatInput;
  systemPrompt: string;
  signal: AbortSignal;
  requestStartedAt: string;
  requestStartedMs: number;
  timedOut: () => boolean;
  clientAborted: () => boolean;
}) {
  const modelStartedMs = performance.now();
  const modelStartedAt = toIstTimestamp();
  const metrics: MutableMetrics = {
    requestStartedAt,
    requestStartedMs,
    modelStartedAt,
    modelStartedMs,
    streamStartedAt: null,
    streamStartedMs: null,
    firstChunkAt: null,
    firstChunkMs: null,
    firstTextAt: null,
    firstTextMs: null,
    firstReasoningAt: null,
    firstReasoningMs: null,
    chunks: 0,
    textChunks: 0,
    reasoningChunks: 0,
    outputChars: 0,
    reasoningChars: 0,
    lastChunkMs: null,
    maxChunkGapMs: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    finishReason: null,
  };

  logChat("info", "model.request.started", context, {
    at: modelStartedAt,
    elapsedMs: roundMs(modelStartedMs - requestStartedMs),
  });

  let lastProgressLogMs = modelStartedMs;

  try {
    const modelStream = await streamChatModel({
      systemPrompt,
      messages: input.messages,
      signal,
      mode: context.mode,
      requestId: context.requestId,
    });

    metrics.streamStartedMs = performance.now();
    metrics.streamStartedAt = toIstTimestamp();
    for await (const chunk of modelStream) {
      const now = performance.now();
      const chunkGapMs =
        metrics.lastChunkMs === null ? null : now - metrics.lastChunkMs;
      metrics.chunks++;

      if (metrics.firstChunkMs === null) {
        metrics.firstChunkMs = now;
        metrics.firstChunkAt = toIstTimestamp();
      }

      if (chunkGapMs !== null) {
        metrics.maxChunkGapMs = Math.max(
          metrics.maxChunkGapMs,
          chunkGapMs
        );
      }
      metrics.lastChunkMs = now;

      updateUsage(metrics, chunk.usage_metadata);
      metrics.finishReason =
        readString(chunk.response_metadata, "finishReason") ??
        readString(chunk.response_metadata, "finish_reason") ??
        metrics.finishReason;

      const reasoning = readReasoningSummary(chunk.contentBlocks);
      if (reasoning) {
        if (metrics.firstReasoningMs === null) {
          metrics.firstReasoningMs = now;
          metrics.firstReasoningAt = toIstTimestamp();
          logChat("info", "model.first_reasoning", context, {
            at: metrics.firstReasoningAt,
            timeToFirstReasoningMs: roundMs(now - modelStartedMs),
          });
          lastProgressLogMs = now;
        }
        metrics.reasoningChunks++;
        metrics.reasoningChars += reasoning.length;
        enqueueEvent(controller, encoder, {
          type: "reasoning_delta",
          text: reasoning,
        });
      }

      const text = readVisibleText(chunk.contentBlocks, chunk.text);
      if (text) {
        if (metrics.firstTextMs === null) {
          metrics.firstTextMs = now;
          metrics.firstTextAt = toIstTimestamp();
          logChat("info", "model.first_text", context, {
            at: metrics.firstTextAt,
            timeToFirstTextMs: roundMs(now - modelStartedMs),
          });
          lastProgressLogMs = now;
        }
        metrics.textChunks++;
        metrics.outputChars += text.length;
        enqueueEvent(controller, encoder, { type: "delta", text });
      }

      if (now - lastProgressLogMs >= env.CHAT_LOG_PROGRESS_MS) {
        lastProgressLogMs = now;
        logChat("info", "model.stream.progress", context, {
          streamingMs:
            metrics.firstTextMs === null
              ? null
              : roundMs(now - metrics.firstTextMs),
          chunks: metrics.chunks,
          textChunks: metrics.textChunks,
          reasoningChunks: metrics.reasoningChunks,
          outputChars: metrics.outputChars,
          reasoningChars: metrics.reasoningChars,
          lastChunkGapMs: chunkGapMs === null ? null : roundMs(chunkGapMs),
        });
      }
    }

    const completedMs = performance.now();
    const finalMetrics = finalizeMetrics(
      context,
      metrics,
      completedMs,
      toIstTimestamp()
    );
    enqueueEvent(controller, encoder, { type: "done", metrics: finalMetrics });
    logChat("info", "model.stream.completed", context, { ...finalMetrics });
  } catch (error) {
    const totalMs = roundMs(performance.now() - requestStartedMs);
    const code = timedOut()
      ? "timeout"
      : clientAborted() || isAbortError(error)
        ? "aborted"
        : "upstream_error";

    logChat(code === "aborted" ? "warn" : "error", "model.stream.failed", context, {
      code,
      totalMs,
      chunks: metrics.chunks,
      outputChars: metrics.outputChars,
      error: serializeError(error),
    });

    if (!clientAborted()) {
      enqueueEvent(controller, encoder, {
        type: "error",
        requestId: context.requestId,
        code,
        message:
          code === "timeout"
            ? "Generation timed out. Please try a smaller request."
            : code === "aborted"
              ? "Generation was cancelled."
              : "The model stream was interrupted. Please try again.",
      });
    }
  }
}

function finalizeMetrics(
  context: RequestContext,
  metrics: MutableMetrics,
  completedMs: number,
  completedAt: string
): ChatStreamMetrics {
  const textStreamingMs =
    metrics.firstTextMs === null ? null : completedMs - metrics.firstTextMs;
  const streamingMs =
    metrics.streamStartedMs === null ? null : completedMs - metrics.streamStartedMs;
  return {
    requestId: context.requestId,
    model: env.GEMINI_MODEL,
    mode: context.mode,
    reasoningEffort: env.GEMINI_REASONING_EFFORT,
    requestStartedAt: metrics.requestStartedAt,
    modelStartedAt: metrics.modelStartedAt,
    streamStartedAt: metrics.streamStartedAt,
    firstChunkAt: metrics.firstChunkAt,
    firstTextAt: metrics.firstTextAt,
    firstReasoningAt: metrics.firstReasoningAt,
    completedAt,
    requestToModelMs: roundMs(
      metrics.modelStartedMs - metrics.requestStartedMs
    ),
    modelSetupMs: roundMs(
      (metrics.streamStartedMs ?? completedMs) - metrics.modelStartedMs
    ),
    timeToFirstChunkMs:
      metrics.firstChunkMs === null
        ? null
        : roundMs(metrics.firstChunkMs - metrics.modelStartedMs),
    timeToFirstTextMs:
      metrics.firstTextMs === null
        ? null
        : roundMs(metrics.firstTextMs - metrics.modelStartedMs),
    timeToFirstReasoningMs:
      metrics.firstReasoningMs === null
        ? null
        : roundMs(metrics.firstReasoningMs - metrics.modelStartedMs),
    reasoningToFirstTextMs:
      metrics.firstReasoningMs === null || metrics.firstTextMs === null
        ? null
        : roundMs(metrics.firstTextMs - metrics.firstReasoningMs),
    streamOpenToFirstTextMs:
      metrics.firstTextMs === null || metrics.streamStartedMs === null
        ? null
        : roundMs(metrics.firstTextMs - metrics.streamStartedMs),
    streamingMs: streamingMs === null ? null : roundMs(streamingMs),
    textStreamingMs:
      textStreamingMs === null ? null : roundMs(textStreamingMs),
    totalMs: roundMs(completedMs - metrics.requestStartedMs),
    chunks: metrics.chunks,
    textChunks: metrics.textChunks,
    reasoningChunks: metrics.reasoningChunks,
    outputChars: metrics.outputChars,
    reasoningChars: metrics.reasoningChars,
    maxChunkGapMs: roundMs(metrics.maxChunkGapMs),
    charsPerSecond:
      textStreamingMs && textStreamingMs > 0
        ? roundMs(metrics.outputChars / (textStreamingMs / 1000))
        : null,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    totalTokens: metrics.totalTokens,
    finishReason: metrics.finishReason,
  };
}

function enqueueEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: ChatStreamEvent
) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    // Cancellation races can close the controller before the provider stops.
  }
}

function updateUsage(
  metrics: MutableMetrics,
  usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      }
    | undefined
) {
  if (!usage) return;
  // ChatGoogle emits per-chunk usage deltas, so totals must be accumulated.
  if (usage.input_tokens !== undefined) {
    metrics.inputTokens = (metrics.inputTokens ?? 0) + usage.input_tokens;
  }
  if (usage.output_tokens !== undefined) {
    metrics.outputTokens = (metrics.outputTokens ?? 0) + usage.output_tokens;
  }
  if (usage.total_tokens !== undefined) {
    metrics.totalTokens = (metrics.totalTokens ?? 0) + usage.total_tokens;
  }
}

function countInputChars(input: ChatInput) {
  return input.messages.reduce(
    (sum, message) => sum + message.content.length,
    0
  );
}

function readString(
  value: Record<string, unknown> | undefined,
  key: string
): string | null {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function readReasoningSummary(
  contentBlocks: ReadonlyArray<{ type: string; reasoning?: string }>
) {
  return contentBlocks
    .filter(
      (block): block is { type: "reasoning"; reasoning: string } =>
        block.type === "reasoning" && typeof block.reasoning === "string"
    )
    .map((block) => block.reasoning)
    .join("");
}

function readVisibleText(
  contentBlocks: ReadonlyArray<{
    type: string;
    text?: string;
    reasoning?: string;
  }>,
  fallbackText: string
) {
  const text = contentBlocks
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string"
    )
    .map((block) => block.text)
    .join("");

  if (text) return text;
  const isReasoningOnly = contentBlocks.some(
    (block) =>
      block.type === "reasoning" && typeof block.reasoning === "string"
  );
  return isReasoningOnly ? "" : fallbackText;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack?.split("\n").slice(0, 8).join("\n"),
  };
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}
