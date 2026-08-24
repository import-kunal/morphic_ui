import { NextRequest } from "next/server";
import { z } from "zod";
import { createTextAgent } from "@/lib/agent";

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

export async function POST(req: NextRequest) {
  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const agent = createTextAgent();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
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
