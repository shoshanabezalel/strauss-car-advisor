import { describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { toComparisonView, WAIVER_LABEL } from "@/lib/chat/comparison-view";
import { createMemoryVouSource } from "@/lib/vou";

const config = loadConfig();
const employees = config.employees.employees;

async function compare(e: (typeof employees)[number]) {
  const deps = { config, vouSource: createMemoryVouSource([]), state: createAgentState(e.profile), repQueue: createMemoryRepQueue() };
  return createToolHandlers(deps).compareOptions({ options: [e.alternative] });
}

/** Every number anywhere in `display` of the tool output. */
function displayNumbers(out: Awaited<ReturnType<typeof compare>>): Set<number> {
  const rows = [out.today, ...out.options];
  return new Set(rows.flatMap((r) => Object.values(r.display).filter((v): v is number => typeof v === "number")));
}

describe("toComparisonView", () => {
  it.each(employees.map((e) => [e.id, e] as const))("%s: every amount is a display value, nothing computed", async (_id, e) => {
    const out = await compare(e);
    const view = toComparisonView(out, config);
    const allowed = displayNumbers(out);

    expect(view.rows).toHaveLength(2);
    for (const row of view.rows) {
      for (const v of Object.values(row.amounts)) if (v !== undefined) expect(allowed).toContain(v);
    }
    const [today, alt] = view.rows;
    expect(today.isToday).toBe(true);
    expect(today.amounts.net).toBe(e.expected.netToday);
    expect(today.amounts.diffVsToday).toBeUndefined();
    expect(alt.amounts).toMatchObject({ net: e.expected.netAlt, diffVsToday: e.expected.diff });
    expect(alt.eligible).toBe(e.expected.eligible);
    expect(alt.reason).toBe(e.expected.reason);
  });

  it("E-001: labels and flags", async () => {
    const e = employees[0];
    const view = toComparisonView(await compare(e), config);
    const [today, alt] = view.rows;
    expect(today.label).toContain("COROLLA CROSS");
    expect(alt).toMatchObject({ label: expect.stringContaining("ATTO 3"), kind: "car", drive: "electric", direction: "up" });
    expect(alt.changes).toEqual(expect.arrayContaining(["valueOfUse", "electric"]));
  });

  it("a waiver row uses the waiver label", async () => {
    const e = employees.find((x) => x.alternative.kind === "waiver")!;
    const view = toComparisonView(await compare(e), config);
    expect(view.rows[1]).toMatchObject({ kind: "waiver", label: WAIVER_LABEL, track: "waiver" });
  });

  it("an incomplete profile gives rows without net and with missing fields", async () => {
    const deps = { config, vouSource: createMemoryVouSource([]), state: createAgentState({ group: "ג" }), repQueue: createMemoryRepQueue() };
    const out = await createToolHandlers(deps).compareOptions({ options: [{ kind: "waiver" }] });
    const view = toComparisonView(out, config);
    expect(view.rows[1].amounts.net).toBeUndefined();
    expect(view.rows[1].missing.length).toBeGreaterThan(0);
  });
});
