export type ChatMode = "ui" | "text";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface ChatStreamMetrics {
  requestId: string;
  model: string;
  mode: ChatMode;
  reasoningEffort: ReasoningEffort;
  requestStartedAt: string;
  modelStartedAt: string;
  streamStartedAt: string | null;
  firstChunkAt: string | null;
  firstTextAt: string | null;
  firstReasoningAt: string | null;
  completedAt: string;
  requestToModelMs: number;
  modelSetupMs: number;
  timeToFirstChunkMs: number | null;
  timeToFirstTextMs: number | null;
  timeToFirstReasoningMs: number | null;
  reasoningToFirstTextMs: number | null;
  streamOpenToFirstTextMs: number | null;
  streamingMs: number | null;
  textStreamingMs: number | null;
  totalMs: number;
  chunks: number;
  textChunks: number;
  reasoningChunks: number;
  outputChars: number;
  reasoningChars: number;
  maxChunkGapMs: number;
  charsPerSecond: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
}

export type ChatStreamEvent =
  | {
      type: "start";
      requestId: string;
      model: string;
      mode: ChatMode;
      reasoningEffort: ReasoningEffort;
      requestStartedAt: string;
    }
  | { type: "reasoning_delta"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; metrics: ChatStreamMetrics }
  | {
      type: "error";
      requestId: string;
      code: "aborted" | "timeout" | "upstream_error";
      message: string;
    };
