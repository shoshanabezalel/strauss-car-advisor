import { describe, expect, it } from "vitest";
import { checkNumbers, createAgentState, createMemoryRepQueue, createToolHandlers, extractNumbers } from "@/lib/agent";
import { explainOption } from "@/lib/agent/explain";
import { toComparisonView } from "@/lib/chat/comparison-view";
import { loadConfig, type Situation } from "@/lib/config";
import type { EmployeeProfile } from "@/lib/engine";
import { createMemoryVouSource } from "@/lib/vou";

// F4: two plain-Hebrew lines per option, built in code from the table's display values only.
const config = loadConfig();
const employees = config.employees.employees;

async function compare(profile: EmployeeProfile, option: Situation) {
  const tools = createToolHandlers({ config, vouSource: createMemoryVouSource([]), state: createAgentState(structuredClone(profile)), repQueue: createMemoryRepQueue() });
  return tools.compareOptions({ options: [option] });
}
const asRequested = (s: Situation): Situation => (s.kind === "car" ? { kind: "car", carId: s.carId } : s);

describe("explainOption", () => {
  it.each(employees.map((e) => [e.id, e] as const))("%s: at most two lines, every number from the display values", async (_id, e) => {
    const c = await compare(e.profile, asRequested(e.alternative));
    const lines = explainOption(c.today, c.options[0]);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) expect(line).toMatch(/[֐-׿]/);
    const guard = checkNumbers(lines.join("\n"), { toolOutputs: [c.today.display, c.options[0].display] });
    expect(guard, lines.join("\n")).toEqual({ ok: true, invented: [] });
  });

  // The sheet's "why" column names the same facts; its "+250 ₪ נטו" is the rules' net bonus, not a table amount.
  it.each(employees.map((e) => [e.id, e] as const))("%s: names every amount the sheet's explanation names", async (_id, e) => {
    const c = await compare(e.profile, asRequested(e.alternative));
    const text = explainOption(c.today, c.options[0]).join("\n");
    const sheet = e.expected.why.replace(/\+?[\d,]+\s*₪\s*נטו/g, "");
    for (const n of extractNumbers(sheet)) expect(text, `${n.raw} in: ${text}`).toContain(n.value.toLocaleString("en-US"));
  });

  it("E-001 wording: value-of-use goes down, EV refund added", async () => {
    const e = employees[0];
    const c = await compare(e.profile, asRequested(e.alternative));
    const [tax, net] = explainOption(c.today, c.options[0]);
    expect(tax).toContain("שווי השימוש יורד");
    expect(tax).toContain("המס");
    expect(net).toContain("החזר חשמל");
  });

  it("waiver (E-005): maintenance instead of a car, no participation", async () => {
    const e = employees.find((x) => x.alternative.kind === "waiver")!;
    const text = explainOption(...(await compare(e.profile, e.alternative).then((c) => [c.today, c.options[0]] as const))).join("\n");
    expect(text).toContain("אחזקת רכב");
    expect(text).toContain("השתתפות");
  });

  it("not eligible: the engine's Hebrew reason, nothing else", async () => {
    const e = employees[0]; // group ג
    const higher = config.catalog.cars.find((c) => c.group === "ד")!;
    const c = await compare(e.profile, { kind: "car", carId: higher.id });
    expect(c.options[0].eligibility.eligible).toBe(false);
    expect(explainOption(c.today, c.options[0])).toEqual([c.options[0].eligibility.reason]);
  });

  it("no change at all → one line saying so", async () => {
    const e = employees[0];
    const current = e.profile.current as Extract<Situation, { kind: "car" }>;
    const c = await compare(e.profile, { kind: "car", carId: current.carId, participation: current.participation });
    expect(explainOption(c.today, c.options[0])).toEqual(["אין שינוי ברכיבים לעומת היום."]);
  });

  it("the comparison view carries the lines; today has none", async () => {
    const e = employees[0];
    const c = await compare(e.profile, asRequested(e.alternative));
    const view = toComparisonView(c, config);
    expect(view.rows[0].explanation).toEqual([]);
    expect(view.rows[1].explanation).toEqual(explainOption(c.today, c.options[0]));
  });
});
