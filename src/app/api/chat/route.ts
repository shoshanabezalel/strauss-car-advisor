import { z } from "zod";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { encodeEvent } from "@/lib/chat/ndjson";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";
import { NO_STORE, ownerOf } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS, llmBudgetKey } from "@/lib/security/rate-limit";

// Up to two generations with tool steps (run-turn.ts), plus one retry and the fallback model (fallback-model.ts).
// Fluid compute on Vercel allows up to 300 s; the turn itself stops at TURN_BUDGET_MS and reports "busy".
export const maxDuration = 120;
const TURN_BUDGET_MS = 100_000;

const ChatRequest = z.object({
  conversationId: z.uuid().optional(),
  text: z.string().trim().min(1).max(4000),
});

const FAILED: ChatEvent = { type: "error", error: "failed", message: "משהו השתבש ולא הצלחתי לענות. אפשר לנסות שוב בעוד רגע." };

/** One employee message → NDJSON stream of ChatEvent (src/lib/chat/handle-turn.ts). The reply arrives only after the guard. */
export async function POST(request: Request) {
  const deps = chatDeps();
  const body = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });

  // Loose per IP (venue Wi-Fi); the real cost guard is per conversation and the global daily cap on LLM turns.
  const { conversationId, text } = body.data;
  const ip = clientIp(request);
  const limited = await enforceLimits(
    deps.rateLimiter,
    [
      { limit: LIMITS.chatIpMinute, key: ip },
      { limit: LIMITS.chatIpHour, key: ip },
      ...(conversationId ? [{ limit: LIMITS.chatConversation, key: conversationId }] : []),
      { limit: LIMITS.chatGlobalDay, key: llmBudgetKey({ vercelEnv: process.env.VERCEL_ENV, source: deps.source }) },
    ],
    deps.rateLimitScale,
  );
  if (limited) return limited;

  const owner = ownerOf(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      try {
        await handleChatTurn({
          ...deps,
          model: deps.createModel({ onFallback: () => emit({ type: "status", status: "fallback" }) }),
          conversationId,
          text,
          ownerHash: owner.ownerHash,
          emit,
          // The fallback wrapper does the one retry; the SDK must not retry on top of it.
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TURN_BUDGET_MS),
        });
      } catch (err) {
        console.error("[chat] turn setup failed", err);
        emit(FAILED);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      ...NO_STORE,
      ...agentModeHeader(),
      ...(owner.setCookie ? { "set-cookie": owner.setCookie } : {}),
    },
  });
}
