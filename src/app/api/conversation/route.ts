import { z } from "zod";
import { toComparisonView } from "@/lib/chat/comparison-view";
import { toVisibleHistory } from "@/lib/chat/history";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";

/**
 * GET /api/conversation?c=<uuid> → what the employee screen shows after a reload.
 * TODO(M7): anyone holding the id can read it (no auth in the demo, TECH-DESIGN §10).
 */
export async function GET(request: Request) {
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("c"));
  const headers = { "cache-control": "no-store", ...agentModeHeader() };
  if (!id.success) return Response.json({ error: "invalid_id" }, { status: 400, headers });

  const { store, config } = chatDeps();
  const snap = await store.load(id.data);
  if (!snap) return Response.json({ error: "not_found" }, { status: 404, headers });

  return Response.json(
    {
      conversationId: snap.id,
      status: snap.status,
      messages: toVisibleHistory(snap.messages),
      comparison: snap.comparison ? toComparisonView(snap.comparison, config) : null,
    },
    { headers },
  );
}
