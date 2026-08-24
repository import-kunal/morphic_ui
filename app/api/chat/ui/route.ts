import { NextRequest } from "next/server";
import { z } from "zod";
import { MorphicEngine } from "@/packages/engine";
import { morphicSchemaLibrary } from "@/packages/elements/server";
import { createUIAgent } from "@/lib/agent";

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

// Engine is created once per module (server restart = recreate).
const engine = new MorphicEngine({ library: morphicSchemaLibrary });
const SYSTEM_PROMPT =
  engine.generatePrompt() +
  '\n\nFor conversational replies with no structured data, output: root = Markdown("your response here")';

export async function POST(req: NextRequest) {
  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const agent = createUIAgent(SYSTEM_PROMPT);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // streamMode: "messages" yields [AIMessageChunk, metadata] tuples token-by-token
        const agentStream = await agent.stream(
          {
            messages: body.data.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
          { streamMode: "messages" }
        );

        for await (const chunk of agentStream) {
          // Each chunk is [AIMessageChunk, metadata] — extract the message
          const msg = (Array.isArray(chunk) ? chunk[0] : chunk) as {
            text?: string;
            content?: string | unknown[];
          };
          const text =
            typeof msg?.text === "string"
              ? msg.text
              : typeof msg?.content === "string"
              ? msg.content
              : null;
          if (text) controller.enqueue(enc.encode(text));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(enc.encode(`\n\nError: ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
