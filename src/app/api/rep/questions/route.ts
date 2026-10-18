import { toRepQuestionView } from "@/lib/chat/rep-view";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";

/**
 * GET /api/rep/questions → open representative questions with the context needed to answer them.
 * TODO(M7): no auth on the rep screen yet (TECH-DESIGN §10).
 */
export async function GET() {
  const { store, config } = chatDeps();
  const open = await store.listOpenRepQuestions();
  const ids = [...new Set(open.map((q) => q.conversationId))];
  const snaps = new Map((await Promise.all(ids.map((id) => store.load(id)))).flatMap((s) => (s ? [[s.id, s] as const] : [])));
  const questions = open.flatMap((q) => {
    const snap = snaps.get(q.conversationId);
    return snap ? [toRepQuestionView(q, snap, config)] : [];
  });
  return Response.json({ questions }, { headers: { "cache-control": "no-store", ...agentModeHeader() } });
}
