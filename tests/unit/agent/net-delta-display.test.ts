import { describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers } from "@/lib/agent";
import { loadConfig, type Situation } from "@/lib/config";
import { displayParts } from "@/lib/format/money";
import { createMemoryVouSource } from "@/lib/vou";

// The breakdown as shown: whole shekels per line, the rounding remainder on the last line, so the lines on screen
// add up to the change on screen.
const config = loadConfig();
const employees = config.employees.employees;
const asRequested = (s: Situation): Situation => (s.kind === "car" ? { kind: "car", carId: s.carId } : s);

describe("displayParts", () => {
  it("rounds each part and puts the remainder on the last one", () => {
    expect(displayParts([100.4, 200.4, 300.4], 601)).toEqual([100, 200, 301]);
    expect(displayParts([350, 2155.67, 1056.6], 3562)).toEqual([350, 2156, 1056]);
    expect(displayParts([-250, -2121.89, -1150], -3522)).toEqual([-250, -2122, -1150]);
    expect(displayParts([], 0)).toEqual([]);
  });
});

describe("compareOptions display.netDelta", () => {
  it.each(employees.map((e) => [e.id, e] as const))("%s: whole shekels that sum exactly to display.diffVsToday", async (_id, e) => {
    const tools = createToolHandlers({ config, vouSource: createMemoryVouSource([]), state: createAgentState(structuredClone(e.profile)), repQueue: createMemoryRepQueue() });
    const c = await tools.compareOptions({ options: [asRequested(e.alternative)] });
    const o = c.options[0];
    expect(o.display.diffVsToday).toBe(e.expected.diff);
    const lines = o.display.netDelta!;
    expect(lines.map((l) => l.kind)).toEqual(o.netDelta!.map((l) => l.kind));
    for (const l of lines) expect(Number.isInteger(l.amount)).toBe(true);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(o.display.diffVsToday);
  });
});
