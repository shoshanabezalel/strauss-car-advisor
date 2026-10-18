import { z } from "zod";
import { RepAnswerSchema } from "@/lib/agent/schemas";
import { answerRepQuestion, type RepAnswerError } from "@/lib/chat/rep-answer";
import { chatDeps } from "@/lib/chat/server";

/**
 * POST /api/rep/answer → apply a representative's answer as data (src/lib/chat/rep-answer.ts).
 * TODO(M7): no auth (anyone with the URL can answer) and no rate limiting (TECH-DESIGN §10).
 */
const AnswerRequest = z.object({
  questionId: z.uuid(),
  answer: RepAnswerSchema,
  answeredBy: z.string().trim().min(1).max(60).optional(),
});

const STATUS: Record<RepAnswerError, number> = { not_found: 404, mismatch: 400, already_answered: 409, invalid: 422, failed: 500 };

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  const body = AnswerRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request", message: "הבקשה לא תקינה." }, { status: 400, headers });

  const { store, config, vouSource, notifier } = chatDeps();
  const res = await answerRepQuestion({ store, config, vouSource, notifier, ...body.data });
  if (!res.ok) return Response.json({ error: res.error, message: res.message }, { status: STATUS[res.error], headers });
  return Response.json({ ok: true, conversationId: res.conversationId }, { headers });
}
