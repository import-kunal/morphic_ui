export type ChatMode = "ui" | "text";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";
export type IqraSource = "postgres";

export interface ToolActivity {
  callId: string;
  tool: string;
  startedAt: string;
  status: "running" | "finished" | "error";
  durationMs?: number;
  source?: IqraSource;
  rowCount?: number;
}

export interface ChatStreamMetrics {
  requestId: string;
  provider: "openrouter";
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
  toolCalls: number;
  toolFailures: number;
  totalToolMs: number;
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
      provider: "openrouter";
      model: string;
      mode: ChatMode;
      reasoningEffort: ReasoningEffort;
      requestStartedAt: string;
    }
  | { type: "reasoning_delta"; text: string }
  | { type: "content_reset" }
  | {
      type: "tool_started";
      tool: string;
      callId: string;
      startedAt: string;
    }
  | {
      type: "tool_completed";
      tool: string;
      callId: string;
      durationMs: number;
      status: "finished" | "error";
      source?: IqraSource;
      rowCount?: number;
    }
  | { type: "delta"; text: string }
  | { type: "done"; metrics: ChatStreamMetrics }
  | {
      type: "error";
      requestId: string;
      code: "aborted" | "timeout" | "upstream_error";
      message: string;
    };
