import { conversationTopic } from "./conversation-topic";
import { REP_QUEUE_TOPIC } from "./topics";

/**
 * Tells open screens that something changed. A ping carries no data; screens refetch through the API routes,
 * so nothing is read from the tables with the browser key. Failures are logged, never fatal: the client's
 * polling fallback (ping-fallback.ts) covers a missed ping.
 */
export interface Notifier {
  conversation(id: string): Promise<void>;
  repQueue(): Promise<void>;
}

export const noopNotifier: Notifier = {
  async conversation() {},
  async repQueue() {},
};

/** Records the topics it was asked to ping (unit tests). */
export function createMemoryNotifier(secret = "memory-notifier-secret"): Notifier & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async conversation(id) {
      calls.push(conversationTopic(id, secret));
    },
    async repQueue() {
      calls.push(REP_QUEUE_TOPIC);
    },
  };
}
