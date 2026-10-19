import { createHmac } from "node:crypto";
import { CONVERSATION_TOPIC_PREFIX } from "./topics";

/**
 * The broadcast topic of one conversation (server only). Topics are public (private channels need Supabase Auth,
 * a pilot step), so the topic is an HMAC of the id: only its owner learns it, from GET /api/conversation, and a
 * leaked `?c=` link doesn't reveal it.
 */
export function conversationTopic(id: string, secret: string): string {
  return `${CONVERSATION_TOPIC_PREFIX}${createHmac("sha256", secret).update(`topic:${id}`).digest("hex").slice(0, 32)}`;
}
