import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/chat/memory-store";

const answer = { field: "participation" as const, carId: "CAR-10", value: 350 };

describe("memory store: rep questions", () => {
  it("ask → listed open with its car, loaded with the conversation", async () => {
    const store = createMemoryStore();
    const id = await store.create("app");
    const { questionId } = await store.repQueue(id).ask({ question: "?", field: "participation", carId: "CAR-10" });
    const q = (await store.getRepQuestion(questionId))!;
    expect(q).toMatchObject({ id: questionId, conversationId: id, field: "participation", carId: "CAR-10", status: "open" });
    expect(q.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await store.listOpenRepQuestions()).toEqual([q]);
    expect((await store.load(id))!.repQuestions).toEqual([q]);
    expect(await store.getRepQuestion(crypto.randomUUID())).toBeNull();
  });

  it("claim is one-shot; reopen clears the answer", async () => {
    const store = createMemoryStore();
    const id = await store.create("app");
    const { questionId } = await store.repQueue(id).ask({ question: "?", field: "participation", carId: "CAR-10" });
    expect(await store.claimRepQuestion(questionId, answer, "דנה")).toBe(true);
    expect(await store.claimRepQuestion(questionId, answer)).toBe(false);
    expect(await store.getRepQuestion(questionId)).toMatchObject({ status: "answered", answer, answeredBy: "דנה", answeredAt: expect.any(String) });
    expect(await store.listOpenRepQuestions()).toEqual([]);

    await store.reopenRepQuestion(questionId);
    const q = (await store.getRepQuestion(questionId))!;
    expect(q.status).toBe("open");
    expect(q.answer).toBeUndefined();
    expect(q.answeredAt).toBeUndefined();
  });

  it("answered since: only this conversation, only at or after the time", async () => {
    const store = createMemoryStore();
    const a = await store.create("app");
    const b = await store.create("app");
    const qa = await store.repQueue(a).ask({ question: "?", field: "group" });
    const qb = await store.repQueue(b).ask({ question: "?", field: "group" });
    const before = new Date(Date.now() - 1000).toISOString();
    await store.claimRepQuestion(qa.questionId, { field: "group", value: "ג" });
    await store.claimRepQuestion(qb.questionId, { field: "group", value: "ג" });
    expect((await store.repQuestionsAnsweredSince(a, before)).map((q) => q.id)).toEqual([qa.questionId]);
    expect(await store.repQuestionsAnsweredSince(a, new Date(Date.now() + 60_000).toISOString())).toEqual([]);
  });
});
