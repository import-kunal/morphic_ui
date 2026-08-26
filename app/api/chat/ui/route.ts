import { NextRequest } from "next/server";
import { MorphicEngine } from "@/packages/engine";
import { morphicSchemaLibrary } from "@/packages/elements/server";
import { handleChatStream } from "@/lib/chat-stream";

// Engine is created once per module (server restart = recreate).
const engine = new MorphicEngine({ library: morphicSchemaLibrary });
const SYSTEM_PROMPT =
  engine.generatePrompt() +
  '\n\nFor conversational replies with no structured data, output: root = Markdown("your response here")' +
  "\nEvery statement MUST remain on one physical line. Never wrap a ternary or expression across lines." +
  "\nKeep generated example data compact: at most 12 table rows or chart points unless the user explicitly asks for more.";

export async function POST(req: NextRequest) {
  return handleChatStream(req, { mode: "ui", systemPrompt: SYSTEM_PROMPT });
}
