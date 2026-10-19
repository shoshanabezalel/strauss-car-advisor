import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notifier } from "./notifier";
import { conversationTopic } from "./conversation-topic";
import { PING_EVENT, REP_QUEUE_TOPIC } from "./topics";

/** Broadcast pings over Supabase Realtime's REST endpoint (no socket needed on the server). */
export function createSupabaseNotifier(db: SupabaseClient, secret: string): Notifier {
  const ping = async (topic: string) => {
    const channel = db.channel(topic);
    try {
      const res = await channel.httpSend(PING_EVENT, {});
      if (!res.success) console.warn(`[realtime] ping ${topic} failed: ${res.status} ${res.error}`);
    } catch (err) {
      console.warn(`[realtime] ping ${topic} failed`, err);
    } finally {
      await db.removeChannel(channel);
    }
  };
  return {
    conversation: (id) => ping(conversationTopic(id, secret)),
    repQueue: () => ping(REP_QUEUE_TOPIC),
  };
}
