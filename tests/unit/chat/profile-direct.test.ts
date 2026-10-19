import { beforeEach, describe, expect, it } from "vitest";
import { checkNumbers, createAgentState, knownNames, openingMessage } from "@/lib/agent";
import { createMockModel } from "@/lib/agent/mock-model";
import { changeOptions, updateProfileDirect } from "@/lib/chat/direct-actions";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { toVisibleHistory } from "@/lib/chat/history";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { toProfileView } from "@/lib/chat/profile-view";
import { answerRepQuestion } from "@/lib/chat/rep-answer";
import type { ConversationStore } from "@/lib/chat/store";
import { loadConfig } from "@/lib/config";
import { allowedCars, compareOptions } from "@/lib/engine";
import { roundShekel } from "@/lib/format/money";
import { createMemoryNotifier } from "@/lib/realtime/notifier";
import { conversationTopic } from "@/lib/realtime/conversation-topic";
import { createMemoryVouSource } from "@/lib/vou";

// M6 (F5): the employee edits the profile and swaps cars directly. Same path as the agent: tools → engine →
// guarded reply → persisted round-trip. No LLM.
const config = loadConfig();
const e1 = config.employees.employees[0];
const current = e1.profile.current as { kind: "car"; carId: string; participation: number };
const attoId = (e1.alternative as { carId: string }).carId;
const ev3 = config.catalog.cars.find((c) => c.model === "EV3")!;
const vouSource = createMemoryVouSource([]);
const OWNER = "a".repeat(64);
const SECRET = "s".repeat(40);
let store: ConversationStore;
let notifier: ReturnType<typeof createMemoryNotifier>;
beforeEach(() => {
  store = createMemoryStore();
  notifier = createMemoryNotifier(SECRET);
});
const deps = () => ({ store, config, vouSource, notifier, source: "app" as const, ownerHash: OWNER });

async function e1Conversation() {
  const events: ChatEvent[] = [];
  await handleChatTurn({ store, model: createMockModel(config), config, vouSource, text: openingMessage(config, e1), source: "app", ownerHash: OWNER, emit: (e) => events.push(e) });
  const r = events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
  return r.conversationId;
}
const lastReply = async (id: string) => toVisibleHistory((await store.load(id))!.messages).at(-1)!;

describe("toProfileView", () => {
  it("values for the form (percents as the employee says them), sources, missing", () => {
    const state = createAgentState(structuredClone(e1.profile));
    state.sources = { baseSalary: "employee", group: "employee" };
    const v = toProfileView(state, config);
    expect(v.values).toMatchObject({ baseSalary: e1.profile.baseSalary, pensionPct: 6, studyFundPct: 2.5, current: e1.profile.current });
    expect(v.sources).toEqual({ baseSalary: "employee", group: "employee" });
    expect(v.locked).toEqual([]);
    expect(v.missing).toEqual([]);
  });

  it("rep-confirmed fields are locked, including a rep-confirmed current-car participation", () => {
    const state = createAgentState({ ...structuredClone(e1.profile), current: { ...current, participation: 350, participationSource: "rep" } });
    state.sources = { group: "rep", current: "rep" };
    expect(toProfileView(state, config).locked.sort()).toEqual(["current", "group"]);
  });

  it("choices follow the profile: allowed cars from the engine, waiver per occupation", () => {
    const v = toProfileView(createAgentState(structuredClone(e1.profile)), config);
    expect(v.choices.allowedCars.map((c) => c.id)).toEqual(allowedCars(e1.profile, config).cars.map((c) => c.id));
    expect(v.choices.waiverAllowed).toBe(true);
    expect(v.choices.groups).toEqual(config.rules.groupOrder);
    expect(v.choices.occupations).toHaveLength(config.occupations.occupations.length);
    const empty = toProfileView(createAgentState(), config);
    expect(empty.choices.allowedCars).toEqual([]);
    expect(empty.choices.waiverAllowed).toBeUndefined();
    expect(empty.missing).toContain("baseSalary");
  });
});

describe("updateProfileDirect", () => {
  it("a stated participation change recomputes: today's net drops by exactly the change", async () => {
    const id = await e1Conversation();
    const before = (await store.load(id))!.comparison!;
    const res = await updateProfileDirect({ ...deps(), conversationId: id, updates: [{ field: "current", value: { ...current, participation: current.participation + 100 } }] });
    expect(res.ok).toBe(true);
    const snap = (await store.load(id))!;
    expect(snap.state.sources.current).toBe("employee");
    expect(snap.comparison!.today.breakdown!.net).toBeCloseTo(before.today.breakdown!.net - 100, 9);
    // the alternative's net does not depend on today's participation
    expect(snap.comparison!.options[0].display.net).toBe(before.options[0].display.net);
    expect(notifier.calls).toContain(conversationTopic(id, SECRET));
  });

  it("the reply names the change and passes the number-guard", async () => {
    const id = await e1Conversation();
    await updateProfileDirect({ ...deps(), conversationId: id, updates: [{ field: "baseSalary", value: 20000 }] });
    const snap = (await store.load(id))!;
    const reply = await lastReply(id);
    expect(reply.text).toContain("שכר בסיס");
    expect(reply.text).toContain(snap.comparison!.options[0].display.net!.toLocaleString("en-US"));
    expect(checkNumbers(reply.text, { toolOutputs: [snap.comparison], profile: snap.state.profile, ignoreNames: knownNames(config) }).ok).toBe(true);
    const engine = compareOptions(snap.state.profile, [{ kind: "car", carId: attoId }], config);
    expect(snap.comparison!.options[0].display.net).toBe(roundShekel(engine.options[0].breakdown!.net));
  });

  it("percents arrive as said and are stored as fractions by the tool", async () => {
    const id = await e1Conversation();
    await updateProfileDirect({ ...deps(), conversationId: id, updates: [{ field: "pensionPct", value: 7 }] });
    expect((await store.load(id))!.state.profile.pensionPct).toBeCloseTo(0.07, 12);
  });

  it("an unknown occupation → invalid with the allowed options, nothing stored", async () => {
    const id = await e1Conversation();
    const before = (await store.load(id))!.messages.length;
    const res = await updateProfileDirect({ ...deps(), conversationId: id, updates: [{ field: "occupation", value: "אסטרונאוט" }] });
    expect(res).toMatchObject({ ok: false, error: "invalid" });
    if (!res.ok) expect(res.options?.length).toBe(config.occupations.occupations.length);
    expect((await store.load(id))!.messages).toHaveLength(before);
  });

  it("a rep-confirmed field is locked", async () => {
    const id = await e1Conversation();
    const { questionId } = await store.repQueue(id).ask({ question: "?", field: "group" });
    await answerRepQuestion({ store, config, vouSource, notifier, questionId, answer: { field: "group", value: e1.profile.group } });
    const res = await updateProfileDirect({ ...deps(), conversationId: id, updates: [{ field: "group", value: "א" }] });
    expect(res).toMatchObject({ ok: false, error: "locked" });
    expect((await store.load(id))!.state.profile.group).toBe(e1.profile.group);
  });

  it("no conversation yet → one is created; without a comparison the reply lists what is missing", async () => {
    const res = await updateProfileDirect({ ...deps(), updates: [{ field: "group", value: "ג" }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const reply = await lastReply(res.conversationId);
    expect(reply.text).toContain("שכר בסיס");
    expect(reply.notices).toContainEqual({ kind: "missing", fields: expect.arrayContaining(["baseSalary"]) });
  });

  it("an unknown conversation → not_found", async () => {
    expect(await updateProfileDirect({ ...deps(), conversationId: crypto.randomUUID(), updates: [{ field: "bonus", value: 1 }] })).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });
});

describe("changeOptions", () => {
  it("EV3 then back to ATTO 3 returns to the sheet's net", async () => {
    const id = await e1Conversation();
    expect((await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: ev3.id }] })).ok).toBe(true);
    expect((await store.load(id))!.comparison!.options[0].situation).toMatchObject({ carId: ev3.id });
    await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: attoId }] });
    expect((await store.load(id))!.comparison!.options[0].display.net).toBe(e1.expected.netAlt);
  });

  it("two options (car + waiver): one reply line each, maintenance in the waiver row", async () => {
    const id = await e1Conversation();
    await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: attoId }, { kind: "waiver" }] });
    const snap = (await store.load(id))!;
    expect(snap.comparison!.options).toHaveLength(2);
    expect(snap.comparison!.options[1].display.maintenance).toBeGreaterThan(0);
    const reply = await lastReply(id);
    expect(reply.text).toContain("ATTO 3");
    expect(reply.text).toContain("ויתור");
    expect(checkNumbers(reply.text, { toolOutputs: [snap.comparison], profile: snap.state.profile, ignoreNames: knownNames(config) }).ok).toBe(true);
  });

  it("a car outside the catalog, no options, or more than three → invalid", async () => {
    const id = await e1Conversation();
    expect(await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: "CAR-99" }] })).toMatchObject({ ok: false, error: "invalid" });
    expect(await changeOptions({ ...deps(), conversationId: id, options: [] })).toMatchObject({ ok: false, error: "invalid" });
    const four = config.catalog.cars.slice(0, 4).map((c) => ({ kind: "car" as const, carId: c.id }));
    expect(await changeOptions({ ...deps(), conversationId: id, options: four })).toMatchObject({ ok: false, error: "invalid" });
  });

  it("a participation the client sends is ignored: new cars always use the rep answer or the catalog default", async () => {
    const id = await e1Conversation();
    await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: attoId, participation: 1 } as never] });
    expect((await store.load(id))!.comparison!.options[0]).toMatchObject({ participationSource: "catalog_default", needsConfirmation: true });
  });

  it("a rep-confirmed participation survives swapping away and back", async () => {
    const id = await e1Conversation();
    const { questionId } = await store.repQueue(id).ask({ question: "?", field: "participation", carId: attoId });
    await answerRepQuestion({ store, config, vouSource, notifier, questionId, answer: { field: "participation", carId: attoId, value: 350 } });
    await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: ev3.id }] });
    await changeOptions({ ...deps(), conversationId: id, options: [{ kind: "car", carId: attoId }] });
    expect((await store.load(id))!.comparison!.options[0]).toMatchObject({ participation: 350, participationSource: "rep", needsConfirmation: false });
  });

  it("an incomplete profile → invalid with the missing fields, nothing stored", async () => {
    const res = await updateProfileDirect({ ...deps(), updates: [{ field: "group", value: "ג" }] });
    if (!res.ok) throw new Error("setup");
    const r = await changeOptions({ ...deps(), conversationId: res.conversationId, options: [{ kind: "car", carId: attoId }] });
    expect(r).toMatchObject({ ok: false, error: "incomplete" });
  });
});

// M7: profile edits and option changes check the owner like the chat does.
describe("direct actions: owner", () => {
  it("another owner → not_found for both actions, and nothing changes", async () => {
    const id = await e1Conversation();
    const before = await store.load(id);
    const other = { ...deps(), ownerHash: "b".repeat(64) };
    expect(await updateProfileDirect({ ...other, conversationId: id, updates: [{ field: "bonus", value: 1 }] })).toMatchObject({ ok: false, error: "not_found" });
    expect(await changeOptions({ ...other, conversationId: id, options: [{ kind: "waiver" }] })).toMatchObject({ ok: false, error: "not_found" });
    expect(await store.load(id)).toEqual(before);
  });

  it("a conversation the form starts belongs to the caller", async () => {
    const res = await updateProfileDirect({ ...deps(), updates: [{ field: "group", value: "ג" }] });
    if (!res.ok) throw new Error(res.message);
    expect((await store.load(res.conversationId))!.ownerHash).toBe(OWNER);
  });

  it("a conversation without an owner → not_found", async () => {
    const id = await store.create("app");
    expect(await updateProfileDirect({ ...deps(), conversationId: id, updates: [{ field: "bonus", value: 1 }] })).toMatchObject({ ok: false, error: "not_found" });
  });
});
