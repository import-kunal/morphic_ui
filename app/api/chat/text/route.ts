import { NextRequest } from "next/server";
import { handleChatStream } from "@/lib/chat-stream";

const SYSTEM_PROMPT =
  "You are a helpful assistant. Respond in clear, well-formatted markdown. Be concise.";

export async function POST(req: NextRequest) {
  return handleChatStream(req, { mode: "text", systemPrompt: SYSTEM_PROMPT });
}
