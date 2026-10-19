import { describe, expect, it } from "vitest";
import { conversationTopic } from "@/lib/realtime/conversation-topic";
import { createMemoryNotifier } from "@/lib/realtime/notifier";
import { REP_QUEUE_TOPIC } from "@/lib/realtime/topics";

// M7: broadcast topics stay public (private channels need Supabase Auth, pilot). The conversation topic is an HMAC
// of the id, handed only to the owner by GET /api/conversation, so a leaked ?c= link doesn't reveal it.
const SECRET = "s".repeat(40);
const id = "6f1c1f43-3b0a-4f0e-9a52-2b9f5f0c8e11";

describe("conversationTopic", () => {
  it("deterministic, prefixed, and does not contain the id", () => {
    const t = conversationTopic(id, SECRET);
    expect(t).toBe(conversationTopic(id, SECRET));
    expect(t).toMatch(/^conversation:[0-9a-f]{32,}$/);
    expect(t).not.toContain(id);
  });

  it("differs per id and per secret", () => {
    expect(conversationTopic(id, SECRET)).not.toBe(conversationTopic(crypto.randomUUID(), SECRET));
    expect(conversationTopic(id, SECRET)).not.toBe(conversationTopic(id, "t".repeat(40)));
  });

  it("the memory notifier records the same topic the server would ping", async () => {
    const n = createMemoryNotifier(SECRET);
    await n.conversation(id);
    await n.repQueue();
    expect(n.calls).toEqual([conversationTopic(id, SECRET), REP_QUEUE_TOPIC]);
  });
});
