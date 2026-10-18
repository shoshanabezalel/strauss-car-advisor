import { z } from "zod";
import { handleChatTurn } from "@/lib/chat/handle-turn";
import { encodeEvent } from "@/lib/chat/ndjson";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";

// Up to two generations with tool steps (run-turn.ts). TODO(M7): rate limiting per IP / conversation.
export const maxDuration = 60;

const ChatRequest = z.object({
  conversationId: z.uuid().optional(),
  text: z.string().trim().min(1).max(4000),
});

/** One employee message → NDJSON stream of ChatEvent (src/lib/chat/handle-turn.ts). The reply arrives only after the guard. */
export async function POST(request: Request) {
  const body = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const deps = chatDeps();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await handleChatTurn({
        ...deps,
        model: deps.createModel(),
        conversationId: body.data.conversationId,
        text: body.data.text,
        emit: (e) => controller.enqueue(encoder.encode(encodeEvent(e))),
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", ...agentModeHeader() },
  });
}
