/** Broadcast topics. Pings carry no data: clients refetch through the API routes (TECH-DESIGN §7b). */
export const PING_EVENT = "ping";
export const REP_QUEUE_TOPIC = "rep-queue";
/** A conversation's topic is this prefix + an HMAC of its id (conversation-topic.ts, server only). */
export const CONVERSATION_TOPIC_PREFIX = "conversation:";
