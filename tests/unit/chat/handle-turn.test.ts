import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { BLOCKED_REPLY, missingDataMessage, openingMessage, UNKNOWN_PARTICIPATION_MESSAGE } from "@/lib/agent";
import { withFallback } from "@/lib/agent/fallback-model";
import { createMockModel } from "@/lib/agent/mock-model";
import { ModelBusyError } from "@/lib/agent/model-errors";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { toVisibleHistory } from "@/lib/chat/history";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";

const config = loadConfig();
const e1 = config.employees.employees[0];
const vouSource = createMemoryVouSource([]);
let store: ReturnType<typeof createMemoryStore>;
beforeEach(() => {
  store = createMemoryStore();
});

async function send(text: string, conversationId?: string, model = createMockModel(config)) {
  const events: ChatEvent[] = [];
  await handleChatTurn({ store, model, config, vouSource, conversationId, text, source: "app", emit: (e) => events.push(e) });
  const result = events.find((e) => e.type === "result");
  return { events, result: result as Extract<ChatEvent, { type: "result" }> | undefined };
}

describe("handleChatTurn", () => {
  it("creates a conversation, streams progress, then one result with reply, notices and table", async () => {
    const { events, result } = await send(openingMessage(config, e1));
    expect(events[0]).toMatchObject({ type: "conversation", conversationId: expect.any(String) });
    expect(events.at(-1)?.type).toBe("result");
    expect(events.filter((e) => e.type === "result")).toHaveLength(1);
    // progress happened before the result
    expect(events.some((e) => e.type === "tool" && e.name === "compareOptions")).toBe(true);
    // the reply appears in no event other than the result
    const beforeResult = JSON.stringify(events.slice(0, -1));
    expect(beforeResult).not.toContain(result!.reply);

    expect(result!.blocked).toBe(false);
    expect(result!.notices.some((n) => n.kind === "participation_unconfirmed")).toBe(true);
    expect(result!.comparison?.rows[1].amounts.net).toBe(e1.expected.netAlt);
  });

  it("persists history, state and comparison", async () => {
    const { result } = await send(openingMessage(config, e1));
    const snap = (await store.load(result!.conversationId))!;
    expect(snap.state.profile.baseSalary).toBe(e1.profile.baseSalary);
    expect(snap.state.sources.baseSalary).toBe("employee");
    expect(snap.comparison?.options[0].display.net).toBe(e1.expected.netAlt);

    const visible = toVisibleHistory(snap.messages);
    expect(visible.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(visible[1]).toMatchObject({ text: result!.reply, blocked: false });
    expect(visible[1].notices).toEqual(result!.notices);
    // tool round-trips are stored for the model but not shown
    expect(snap.messages.length).toBeGreaterThan(2);
  });

  it("a second turn continues the same conversation with the saved profile", async () => {
    const first = await send(missingDataMessage(config));
    const id = first.result!.conversationId;
    const second = await send(openingMessage(config, e1), id);
    expect(second.result!.conversationId).toBe(id);
    const snap = (await store.load(id))!;
    expect(toVisibleHistory(snap.messages).map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("a representative question sets the conversation to waiting_rep", async () => {
    const { result } = await send(UNKNOWN_PARTICIPATION_MESSAGE);
    expect(result!.notices.some((n) => n.kind === "rep_question_open")).toBe(true);
    expect((await store.load(result!.conversationId))!.status).toBe("waiting_rep");
  });

  it("a blocked reply is stored as the fixed fallback, never the rejected text", async () => {
    const bad = { content: [{ type: "text" as const, text: "הנטו יהיה 12,345 ₪" }], finishReason: { unified: "stop" as const, raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] };
    const { result, events } = await send("?", undefined, new MockLanguageModelV4({ doGenerate: [bad, bad] }));
    expect(result).toMatchObject({ reply: BLOCKED_REPLY, blocked: true });
    expect(JSON.stringify(events)).not.toContain("12,345");
    const snap = (await store.load(result!.conversationId))!;
    expect(JSON.stringify(snap.messages)).not.toContain("12,345");
  });

  it("an unknown conversation id emits not_found and creates nothing", async () => {
    const { events } = await send("שלום", "00000000-0000-4000-8000-000000000000");
    expect(events).toEqual([{ type: "error", error: "not_found", message: expect.any(String) }]);
  });

  it("a model failure emits a Hebrew error and does not store a reply", async () => {
    const broken = new MockLanguageModelV4({ doGenerate: () => Promise.reject(new Error("quota")) });
    const { events } = await send("שלום", undefined, broken);
    const err = events.at(-1);
    expect(err).toMatchObject({ type: "error", error: "failed" });
    expect((err as { message: string }).message).toMatch(/[א-ת]/);
    expect(JSON.stringify(events)).not.toContain("quota");
  });
});

// M7: model fallback in the chat path.
describe("handleChatTurn: busy and fallback", () => {
  const unavailable = () =>
    new APICallError({ message: "high demand", url: "https://example.test", requestBodyValues: {}, statusCode: 503, responseHeaders: {}, isRetryable: true });

  it("ModelBusyError → a Hebrew 'busy' error without digits; no reply is stored", async () => {
    const busy = new MockLanguageModelV4({ doGenerate: () => Promise.reject(new ModelBusyError(unavailable())) });
    const { events } = await send("שלום", undefined, busy);
    const err = events.at(-1) as Extract<ChatEvent, { type: "error" }>;
    expect(err).toMatchObject({ type: "error", error: "busy" });
    expect(err.message).toMatch(/[א-ת]/);
    expect(err.message).not.toMatch(/\d/);
    const id = (events[0] as Extract<ChatEvent, { type: "conversation" }>).conversationId;
    expect((await store.load(id))!.messages).toEqual([]);
  });

  it("a timed-out turn (abort) is reported as busy too", async () => {
    const aborted = new MockLanguageModelV4({ doGenerate: () => Promise.reject(new DOMException("The operation was aborted", "AbortError")) });
    const { events } = await send("שלום", undefined, aborted);
    expect(events.at(-1)).toMatchObject({ type: "error", error: "busy" });
  });

  it("primary unavailable twice → the fallback finishes the turn with the same tools and engine numbers", async () => {
    const events: ChatEvent[] = [];
    const primary = new MockLanguageModelV4({ doGenerate: () => Promise.reject(unavailable()) });
    const model = withFallback(primary, createMockModel(config), { sleep: async () => {}, onFallback: () => events.push({ type: "status", status: "fallback" }) });
    await handleChatTurn({ store, model, config, vouSource, text: openingMessage(config, e1), source: "app", emit: (e) => events.push(e), maxRetries: 0 });
    const result = events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
    expect(result.comparison?.rows[1].amounts.net).toBe(e1.expected.netAlt);
    const fallbackAt = events.findIndex((e) => e.type === "status" && e.status === "fallback");
    expect(fallbackAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeLessThan(events.indexOf(result));
  });
});
