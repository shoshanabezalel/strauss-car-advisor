import { describe, expect, it, vi } from "vitest";
import { openingMessage } from "@/lib/agent";
import { createMockModel } from "@/lib/agent/mock-model";
import { confirmedUpdates } from "@/app/employee/save-profile";
import { updateProfileDirect } from "@/lib/chat/direct-actions";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { loadConfig } from "@/lib/config";
import { PAYSLIP_FIELDS } from "@/lib/payslip/schema";
import { createMemoryNotifier } from "@/lib/realtime/notifier";
import { createMemoryVouSource } from "@/lib/vou";

// F6: the confirm card saves through the existing profile path (source "employee"), only what was confirmed,
// and payslip values never become information gaps.
const config = loadConfig();
const e1 = config.employees.employees[0];
const OWNER = "a".repeat(64);
const vouSource = createMemoryVouSource([]);

function setup() {
  const store = createMemoryStore();
  const recordGaps = vi.spyOn(store, "recordGaps");
  const deps = { store, config, vouSource, notifier: createMemoryNotifier("s".repeat(40)), source: "app" as const, ownerHash: OWNER };
  return { store, recordGaps, deps };
}

describe("confirmedUpdates", () => {
  it("only the payslip fields that have a value, as numbers", () => {
    expect(confirmedUpdates({ baseSalary: "18500", commissions: "", bonus: " ", pensionPct: "6", studyFundPct: "2.5", creditPoints: "2.75" })).toEqual([
      { field: "baseSalary", value: 18500 },
      { field: "pensionPct", value: 6 },
      { field: "studyFundPct", value: 2.5 },
      { field: "creditPoints", value: 2.75 },
    ]);
  });

  it("never anything outside the six fields", () => {
    expect(confirmedUpdates({ childrenUnder23: "2", occupation: "x", idNumber: "000000000", bonus: "100" })).toEqual([{ field: "bonus", value: 100 }]);
  });
});

describe("saving confirmed payslip values", () => {
  it("a new conversation gets exactly the confirmed fields, all from the employee; nothing else is filled", async () => {
    const { store, recordGaps, deps } = setup();
    const updates = confirmedUpdates({ baseSalary: "18500", commissions: "0", pensionPct: "6", studyFundPct: "2.5", creditPoints: "2.75" });
    const res = await updateProfileDirect({ ...deps, updates });
    expect(res.ok).toBe(true);
    const { state } = (await store.load((res as { conversationId: string }).conversationId))!;
    expect(state.profile).toEqual({ baseSalary: 18500, commissions: 0, pensionPct: 0.06, studyFundPct: 0.025, creditPoints: 2.75 });
    expect(state.sources).toEqual({ baseSalary: "employee", commissions: "employee", pensionPct: "employee", studyFundPct: "employee", creditPoints: "employee" });
    expect(recordGaps).not.toHaveBeenCalled();
  });

  it("on a full comparison, the recompute records no gap about any salary field", async () => {
    const { store, recordGaps, deps } = setup();
    const events: ChatEvent[] = [];
    await handleChatTurn({ ...deps, model: createMockModel(config), text: openingMessage(config, e1), emit: (e) => events.push(e) });
    const { conversationId } = events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
    expect((await store.load(conversationId))!.comparison).toBeTruthy();
    recordGaps.mockClear();

    const res = await updateProfileDirect({ ...deps, conversationId, updates: confirmedUpdates({ baseSalary: "19000", bonus: "500" }) });
    expect(res.ok).toBe(true);
    const topics = recordGaps.mock.calls.flatMap(([, gaps]) => gaps.map((g) => `${g.type} ${g.topic} ${g.description}`)).join("\n");
    for (const f of PAYSLIP_FIELDS) expect(topics).not.toContain(f);
    expect(topics).not.toMatch(/19000|19,000|500\b/);
  });
});
