import { z } from "zod";
import { toComparisonView } from "@/lib/chat/comparison-view";
import { toRepQuestionStatuses, type ConversationResponse } from "@/lib/chat/conversation-response";
import { toVisibleHistory } from "@/lib/chat/history";
import { toProfileView } from "@/lib/chat/profile-view";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";

/**
 * GET /api/conversation?c=<uuid> → what the employee screen shows after a reload or a Realtime ping.
 * TODO(M7): anyone holding the id can read it (no auth in the demo, TECH-DESIGN §10).
 */
export async function GET(request: Request) {
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("c"));
  const headers = { "cache-control": "no-store", ...agentModeHeader() };
  if (!id.success) return Response.json({ error: "invalid_id" }, { status: 400, headers });

  const { store, config } = chatDeps();
  const snap = await store.load(id.data);
  if (!snap) return Response.json({ error: "not_found" }, { status: 404, headers });

  const body: ConversationResponse = {
    conversationId: snap.id,
    status: snap.status,
    messages: toVisibleHistory(snap.messages),
    comparison: snap.comparison ? toComparisonView(snap.comparison, config) : null,
    // Status only: the answer reaches the employee through the tools (reply + comparison), never as raw input.
    repQuestions: toRepQuestionStatuses(snap),
    profile: toProfileView(snap.state, config),
  };
  return Response.json(body, { headers });
}
