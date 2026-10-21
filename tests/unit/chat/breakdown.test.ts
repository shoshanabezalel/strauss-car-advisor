import { beforeEach, describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers, openingMessage } from "@/lib/agent";
import { createMockModel } from "@/lib/agent/mock-model";
import { breakdownOf, toComparisonView } from "@/lib/chat/comparison-view";
import { updateProfileDirect } from "@/lib/chat/direct-actions";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { toVisibleHistory } from "@/lib/chat/history";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { loadConfig, type Situation } from "@/lib/config";
import { createMemoryNotifier } from "@/lib/realtime/notifier";
import { createMemoryVouSource } from "@/lib/vou";

// "איך זה מחושב?" under a reply that carried a comparison (user, 21/10): the same engine lines as the table,
// stored with that reply, so a later comparison or a reload never changes what an older reply showed.
const config = loadConfig();
const employees = config.employees.employees;
const OWNER = "a".repeat(64);
const vouSource = createMemoryVouSource([]);
const asRequested = (s: Situation): Situation => (s.kind === "car" ? { kind: "car", carId: s.carId } : s);
let store: ReturnType<typeof createMemoryStore>;
beforeEach(() => {
  store = createMemoryStore();
});

async function view(id: string, options?: Situation[]) {
  const e = employees.find((x) => x.id === id)!;
  const tools = createToolHandlers({ config, vouSource, state: createAgentState(structuredClone(e.profile)), repQueue: createMemoryRepQueue() });
  return toComparisonView(await tools.compareOptions({ options: options ?? [asRequested(e.alternative)] }), config);
}

describe("breakdownOf", () => {
  it("one entry per eligible option with lines: its label and the table's explanation lines", async () => {
    const v = await view("E-005");
    const option = v.rows.find((r) => !r.isToday)!;
    expect(breakdownOf(v)).toEqual([{ label: option.label, lines: option.explanation }]);
    expect(option.explanation.length).toBe(3);
  });

  it("leaves out today and options that are not eligible", async () => {
    const higher = config.catalog.cars.find((c) => c.group === "ד")!;
    const e1 = employees[0];
    const v = await view("E-001", [asRequested(e1.alternative), { kind: "car", carId: higher.id }]);
    const b = breakdownOf(v);
    expect(b).toHaveLength(1);
    expect(b[0].label).not.toBe(v.rows[0].label);
  });
});

describe("the breakdown travels with the reply", () => {
  it("agent turn: in the result event, stored in the reply's meta, and back after a reload", async () => {
    const events: ChatEvent[] = [];
    await handleChatTurn({ store, model: createMockModel(config), config, vouSource, text: openingMessage(config, employees[0]), source: "app", ownerHash: OWNER, emit: (e) => events.push(e) });
    const result = events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
    expect(result.breakdown).toEqual(breakdownOf(result.comparison!));
    expect(result.breakdown!.length).toBeGreaterThan(0);

    const history = toVisibleHistory((await store.load(result.conversationId))!.messages);
    expect(history.at(-1)).toMatchObject({ role: "assistant", breakdown: result.breakdown });
    expect(history.filter((m) => m.role === "user").every((m) => !("breakdown" in m))).toBe(true);
  });

  it("a turn without a comparison has no breakdown", async () => {
    const events: ChatEvent[] = [];
    await handleChatTurn({ store, model: createMockModel(config), config, vouSource, text: "שלום", source: "app", ownerHash: OWNER, emit: (e) => events.push(e) });
    const result = events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
    expect(result.breakdown).toBeUndefined();
    expect(toVisibleHistory((await store.load(result.conversationId))!.messages).at(-1)!.breakdown).toBeUndefined();
  });

  it("a form edit that recomputes the comparison stores the new breakdown with its reply", async () => {
    const events: ChatEvent[] = [];
    await handleChatTurn({ store, model: createMockModel(config), config, vouSource, text: openingMessage(config, employees[0]), source: "app", ownerHash: OWNER, emit: (e) => events.push(e) });
    const { conversationId } = events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
    const deps = { store, config, vouSource, notifier: createMemoryNotifier("s".repeat(40)), source: "app" as const, ownerHash: OWNER };
    expect((await updateProfileDirect({ ...deps, conversationId, updates: [{ field: "baseSalary", value: 19000 }] })).ok).toBe(true);
    const snap = (await store.load(conversationId))!;
    const last = toVisibleHistory(snap.messages).at(-1)!;
    expect(last.breakdown).toEqual(breakdownOf(toComparisonView(snap.comparison!, config)));
  });
});
