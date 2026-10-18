/** Broadcast topics. Pings carry no data: clients refetch through the API routes (TECH-DESIGN §7b). */
export const PING_EVENT = "ping";
export const REP_QUEUE_TOPIC = "rep-queue";
export const conversationTopic = (id: string) => `conversation:${id}`;
