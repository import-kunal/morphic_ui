import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";
import { env } from "@/config/env";
import type { ChatMode } from "@/lib/chat-protocol";

interface ChatInputMessage {
  role: "user" | "assistant";
  content: string;
}

const model = new ChatGoogle({
  model: env.GEMINI_MODEL,
  apiKey: env.GOOGLE_API_KEY,
  reasoningEffort: env.GEMINI_REASONING_EFFORT,
  maxRetries: 2,
  streamUsage: true,
});

export function streamChatModel({
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
}) {
  return model.stream(toModelMessages(systemPrompt, messages), {
    signal,
    runName: `morphic_${mode}_stream`,
    tags: ["morphic-ui", mode],
    metadata: { requestId, mode, model: env.GEMINI_MODEL },
  });
}

function toModelMessages(
  systemPrompt: string,
  messages: ChatInputMessage[]
): BaseMessage[] {
  return [
    new SystemMessage(systemPrompt),
    ...messages.map((message) =>
      message.role === "user"
        ? new HumanMessage(message.content)
        : new AIMessage(message.content)
    ),
  ];
}
