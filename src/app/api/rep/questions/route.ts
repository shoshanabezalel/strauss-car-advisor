import { connection } from "next/server";
import { toRepQuestionView } from "@/lib/chat/rep-view";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";
import { hasRepSession, NO_STORE, unauthorized } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/** GET /api/rep/questions → open representative questions with the context needed to answer them. Rep session only (M7). */
export async function GET(request: Request) {
  // Request-time only (see /api/conversation): never prerendered at build.
  await connection();
  const { store, config, rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.repQuestionsIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;
  if (!hasRepSession(request)) return unauthorized();

  const open = await store.listOpenRepQuestions();
  const ids = [...new Set(open.map((q) => q.conversationId))];
  const snaps = new Map((await Promise.all(ids.map((id) => store.load(id)))).flatMap((s) => (s ? [[s.id, s] as const] : [])));
  const questions = open.flatMap((q) => {
    const snap = snaps.get(q.conversationId);
    return snap ? [toRepQuestionView(q, snap, config)] : [];
  });
  return Response.json({ questions }, { headers: { ...NO_STORE, ...agentModeHeader() } });
}
