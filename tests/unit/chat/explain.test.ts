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
  it.each(employees.map((e) => [e.id, e] as const))("%s: one line per changed component, every number from the display values", async (_id, e) => {
    const c = await compare(e.profile, asRequested(e.alternative));
    const lines = explainOption(c.today, c.options[0]);
    expect(lines.length).toBe(c.options[0].display.netDelta!.length);
    expect(lines.length).toBeLessThanOrEqual(5);
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

  // The net effect per line, in words (no minus sign), from display.netDelta: the lines add up to the change shown.
  it.each(employees.map((e) => [e.id, e] as const))("%s: each line ends with its net effect, and they sum to the change", async (_id, e) => {
    const c = await compare(e.profile, asRequested(e.alternative));
    const lines = explainOption(c.today, c.options[0]);
    c.options[0].display.netDelta!.forEach(({ amount }, i) => {
      const effect = amount === 0 ? "ללא שינוי בנטו" : `${amount > 0 ? "עלייה" : "ירידה"} של ${Math.abs(amount).toLocaleString("en-US")} ₪ בנטו`;
      expect(lines[i]).toContain(effect);
      // A negative number, not the Hebrew "מ-4,070" prefix.
      expect(lines[i]).not.toMatch(/(^|[\s(:])[-−]\d/);
    });
  });

  it("E-001 wording: value-of-use goes down (taxable, not cash), EV refund added at exactly the net bonus", async () => {
    const e = employees[0];
    const c = await compare(e.profile, asRequested(e.alternative));
    const [vou, ev] = explainOption(c.today, c.options[0]);
    expect(vou).toContain("שווי השימוש יורד");
    expect(vou).toContain("לא כסף");
    expect(vou).toContain("המס");
    expect(ev).toContain("החזר חשמל");
    expect(ev).toContain("עלייה של 250 ₪ בנטו");
  });

  it("waiver (E-005): participation, value-of-use (not cash), allowance after tax", async () => {
    const e = employees.find((x) => x.alternative.kind === "waiver")!;
    const [part, vou, maint] = explainOption(...(await compare(e.profile, e.alternative).then((c) => [c.today, c.options[0]] as const)));
    expect(part).toContain("השתתפות");
    expect(vou).toContain("לא כסף אלא סכום שמחויב במס");
    expect(maint).toContain("אחזקת רכב");
    expect(maint).toContain("אחרי מס");
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
