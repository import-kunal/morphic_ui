import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createAgent } from "langchain";
import { env } from "@/config/env";
import type { ChatMode } from "@/lib/chat-protocol";
import { researchTools } from "@/lib/research/tools";

interface ChatInputMessage {
  role: "user" | "assistant";
  content: string;
}

interface UsageValues {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export type ModelStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "text_reset" }
  | { type: "model"; model: string }
  | { type: "usage"; usage: UsageValues }
  | { type: "finish"; reason: string | null }
  | { type: "tool_started"; tool: string; callId: string; startedMs: number }
  | {
      type: "tool_completed";
      tool: string;
      callId: string;
      durationMs: number;
      status: "finished" | "error";
      summary?: ToolResultSummary;
    };

export interface ToolResultSummary {
  source?: "postgres";
  rowCount?: number;
  matchCount?: number;
  analysis?: string;
  error?: string;
}

const model = new ChatOpenRouter({
  model: env.OPENROUTER_MODEL,
  models: env.OPENROUTER_FALLBACK_MODELS,
  route: "fallback",
  apiKey: env.OPENROUTER_API_KEY,
  maxTokens: env.OPENROUTER_MAX_OUTPUT_TOKENS,
  maxRetries: 2,
  streamUsage: true,
  provider: {
    sort: "latency",
    require_parameters: true,
    data_collection: env.OPENROUTER_DATA_COLLECTION,
  },
  modelKwargs: {
    reasoning:
      env.OPENROUTER_REASONING_MAX_TOKENS > 0
        ? { max_tokens: env.OPENROUTER_REASONING_MAX_TOKENS }
        : { effort: env.OPENROUTER_REASONING_EFFORT },
  },
});

export async function* streamChatModel({
  systemPrompt,
  messages,
  signal,
  mode,
  requestId,
}: {
  systemPrompt: string;
  messages: ChatInputMessage[];
  signal: AbortSignal;
  mode: ChatMode;
  requestId: string;
}): AsyncGenerator<ModelStreamEvent> {
  if (mode === "ui") {
    yield* streamResearchAgent({ systemPrompt, messages, signal, requestId });
    return;
  }

  const stream = await model.stream(toModelMessages(systemPrompt, messages), {
    signal,
    runName: `morphic_${mode}_stream`,
    tags: ["morphic-ui", mode],
    metadata: {
      requestId,
      mode,
      provider: "openrouter",
      model: env.OPENROUTER_MODEL,
    },
  });
  let servedModel: string | null = null;
  for await (const chunk of stream) {
    const chunkModel = readServedModel(chunk.response_metadata);
    if (chunkModel && chunkModel !== servedModel) {
      servedModel = chunkModel;
      yield { type: "model", model: chunkModel };
    }
    const reasoning = readReasoningSummary(chunk.contentBlocks);
    if (reasoning) yield { type: "reasoning", text: reasoning };
    const text = readVisibleText(chunk.contentBlocks, chunk.text);
    if (text) yield { type: "text", text };
    if (chunk.usage_metadata) {
      yield { type: "usage", usage: chunk.usage_metadata };
    }
    const finishReason =
      readString(chunk.response_metadata, "finishReason") ??
      readString(chunk.response_metadata, "finish_reason");
    if (finishReason) yield { type: "finish", reason: finishReason };
  }
}

async function* streamResearchAgent({
  systemPrompt,
  messages,
  signal,
  requestId,
}: {
  systemPrompt: string;
  messages: ChatInputMessage[];
  signal: AbortSignal;
  requestId: string;
}): AsyncGenerator<ModelStreamEvent> {
  const agent = createAgent({
    name: "research_agent",
    model,
    tools: researchTools,
    systemPrompt,
    version: "v2",
  });
  const run = await agent.streamEvents(
    { messages: toConversationMessages(messages) },
    {
      version: "v3",
      signal,
      recursionLimit: env.RESEARCH_AGENT_RECURSION_LIMIT,
      runName: "research_agent",
      tags: ["morphic-ui", "ui", "research"],
      metadata: {
        requestId,
        mode: "ui",
        provider: "openrouter",
        model: env.OPENROUTER_MODEL,
      },
    }
  );
  const queue = new AsyncEventQueue<ModelStreamEvent>();

  void Promise.all([
    consumeAgentMessages(run.messages, queue),
    consumeToolCalls(run.toolCalls, queue),
    run.output,
  ]).then(
    () => queue.close(),
    (error) => queue.fail(error)
  );

  yield* queue;
}

async function consumeAgentMessages(
  messages: AsyncIterable<{
    text: AsyncIterable<string>;
    reasoning: AsyncIterable<string>;
    usage: PromiseLike<UsageValues | undefined>;
    output: PromiseLike<AIMessage>;
  }>,
  queue: AsyncEventQueue<ModelStreamEvent>
) {
  for await (const message of messages) {
    // Each item is a distinct model turn. A tool-planning turn can contain
    // visible text before requesting a tool, so never concatenate turns into
    // one MorphicLang program. The client replaces the previous candidate and
    // streams this turn into a fresh parser instance.
    queue.push({ type: "text_reset" });
    await Promise.all([
      consumeText(message.reasoning, (text) =>
        queue.push({ type: "reasoning", text })
      ),
      consumeText(message.text, (text) => queue.push({ type: "text", text })),
      Promise.resolve(message.usage).then((usage) => {
        if (usage) queue.push({ type: "usage", usage });
      }),
      Promise.resolve(message.output).then((output) => {
        const servedModel = readServedModel(output.response_metadata);
        if (servedModel) queue.push({ type: "model", model: servedModel });
        const reason =
          readString(output.response_metadata, "finishReason") ??
          readString(output.response_metadata, "finish_reason");
        queue.push({ type: "finish", reason });
        if (
          (output.tool_calls?.length ?? 0) > 0 ||
          (output.invalid_tool_calls?.length ?? 0) > 0
        ) {
          // This was a planning turn, not the final UI. Clear any visible text
          // only after its complete message has been classified as a tool turn.
          queue.push({ type: "text_reset" });
        }
      }),
    ]);
  }
}

async function consumeToolCalls(
  calls: AsyncIterable<{
    name: string;
    callId: string;
    output: Promise<unknown>;
    status: Promise<"running" | "finished" | "error">;
    error: Promise<string | undefined>;
  }>,
  queue: AsyncEventQueue<ModelStreamEvent>
) {
  const pending: Promise<void>[] = [];
  for await (const call of calls) {
    const startedMs = performance.now();
    queue.push({
      type: "tool_started",
      tool: call.name,
      callId: call.callId,
      startedMs,
    });
    pending.push(
      completeToolCall(call, startedMs, queue)
    );
  }
  await Promise.all(pending);
}

async function completeToolCall(
  call: {
    name: string;
    callId: string;
    output: Promise<unknown>;
    status: Promise<"running" | "finished" | "error">;
    error: Promise<string | undefined>;
  },
  startedMs: number,
  queue: AsyncEventQueue<ModelStreamEvent>
) {
  const status = await call.status;
  const error = await call.error;
  let output: unknown;
  if (status === "finished") output = await call.output;
  queue.push({
    type: "tool_completed",
    tool: call.name,
    callId: call.callId,
    durationMs: performance.now() - startedMs,
    status: status === "finished" ? "finished" : "error",
    summary: summarizeToolResult(output, error),
  });
}

async function consumeText(
  stream: AsyncIterable<string>,
  onText: (text: string) => void
) {
  for await (const text of stream) {
    if (text) onText(text);
  }
}

function summarizeToolResult(
  output: unknown,
  streamError?: string
): ToolResultSummary | undefined {
  if (streamError) return { error: streamError };
  const raw = readToolOutputText(output);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as {
      ok?: boolean;
      error?: string;
      data?: Record<string, unknown>;
    };
    const data = parsed.data;
    return {
      source: data?.source === "postgres" ? data.source : undefined,
      rowCount: numberOrUndefined(data?.rowCount),
      matchCount: numberOrUndefined(data?.matchCount),
      analysis:
        typeof data?.analysis === "string" ? data.analysis : undefined,
      error: parsed.ok === false ? parsed.error : undefined,
    };
  } catch {
    return undefined;
  }
}

function readToolOutputText(output: unknown) {
  if (typeof output === "string") return output;
  if (output instanceof AIMessage) return output.text;
  if (isRecord(output) && typeof output.content === "string") {
    return output.content;
  }
  return "";
}

function toConversationMessages(messages: ChatInputMessage[]): BaseMessage[] {
  return messages.map((message) =>
    message.role === "user"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content)
  );
}

function toModelMessages(
  systemPrompt: string,
  messages: ChatInputMessage[]
): BaseMessage[] {
  return [new SystemMessage(systemPrompt), ...toConversationMessages(messages)];
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

function readString(
  value: Record<string, unknown> | undefined,
  key: string
): string | null {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function readServedModel(value: Record<string, unknown> | undefined) {
  return readString(value, "model_name") ?? readString(value, "model");
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown;

  push(value: T) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ value, done: false });
    else this.values.push(value);
  }

  close() {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown) {
    this.failure = error;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.values.length) {
        yield this.values.shift() as T;
        continue;
      }
      if (this.failure) throw this.failure;
      if (this.closed) return;
      const result = await new Promise<IteratorResult<T>>((resolve, reject) =>
        this.waiters.push({ resolve, reject })
      );
      if (result.done) return;
      yield result.value;
    }
  }
}
