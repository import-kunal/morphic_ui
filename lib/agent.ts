import { createAgent } from "langchain";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "@/config/env";

function makeModel() {
  return new ChatGoogleGenerativeAI({
    model: env.GEMINI_MODEL,
    apiKey: env.GOOGLE_API_KEY,
    temperature: 0.7,
    maxOutputTokens: 8192,
    streaming: true,
  });
}

/** Agent for /api/chat/ui — generates MorphicLang output. */
export function createUIAgent(systemPrompt: string) {
  return createAgent({
    model: makeModel(),
    tools: [],
    systemPrompt,
    name: "morphic_ui_agent",
  });
}

/** Agent for /api/chat/text — generates plain markdown output. */
export function createTextAgent() {
  return createAgent({
    model: makeModel(),
    tools: [],
    systemPrompt:
      "You are a helpful assistant. Respond in clear, well-formatted markdown. Be concise.",
    name: "morphic_text_agent",
  });
}
