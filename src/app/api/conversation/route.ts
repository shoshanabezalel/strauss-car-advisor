import { z } from "zod";
import { toComparisonView } from "@/lib/chat/comparison-view";
import { toRepQuestionStatuses, type ConversationResponse } from "@/lib/chat/conversation-response";
import { toVisibleHistory } from "@/lib/chat/history";
import { toProfileView } from "@/lib/chat/profile-view";
import { agentModeHeader, chatDeps } from "@/lib/chat/server";
import { appSecret } from "@/lib/env";
import { conversationTopic } from "@/lib/realtime/conversation-topic";
import { NO_STORE } from "@/lib/security/http";
import { OWNER_COOKIE, hashOwner, ownsConversation, readCookie } from "@/lib/security/owner";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/**
 * GET /api/conversation?c=<uuid> → what the employee screen shows after a reload or a Realtime ping.
 * Only for the browser that created it (owner cookie, M7); anyone else gets the same 404 as for a missing id.
 */
export async function GET(request: Request) {
  const headers = { ...NO_STORE, ...agentModeHeader() };
  const { store, config, rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.conversationIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;

  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("c"));
  if (!id.success) return Response.json({ error: "invalid_id" }, { status: 400, headers });

  const token = readCookie(request, OWNER_COOKIE);
  const snap = await store.load(id.data);
  if (!snap || !ownsConversation(snap, token ? hashOwner(token) : undefined)) return Response.json({ error: "not_found" }, { status: 404, headers });

  const body: ConversationResponse = {
    conversationId: snap.id,
    status: snap.status,
    messages: toVisibleHistory(snap.messages),
    comparison: snap.comparison ? toComparisonView(snap.comparison, config) : null,
    // Status only: the answer reaches the employee through the tools (reply + comparison), never as raw input.
    repQuestions: toRepQuestionStatuses(snap),
    profile: toProfileView(snap.state, config),
    topic: conversationTopic(snap.id, appSecret()),
  };
  return Response.json(body, { headers });
}
