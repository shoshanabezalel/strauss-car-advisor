import { describe, expect, it } from "vitest";
import { loadConfig, type Situation } from "@/lib/config";
import { compareOptions } from "@/lib/engine";

// The net change vs today, split per component in net terms (user, 21/10): the lines sum exactly to the change, so
// a reply can never list gross amounts that seem to add up to something else.
const config = loadConfig();
const employees = config.employees.employees;
const ORDER = ["participation", "valueOfUse", "maintenance", "familyGap", "electric"];
const asRequested = (s: Situation): Situation => (s.kind === "car" ? { kind: "car", carId: s.carId } : s);
const compare = (id: string) => {
  const e = employees.find((x) => x.id === id)!;
  const c = compareOptions(e.profile, [asRequested(e.alternative)], config);
  return { today: c.today, option: c.options[0] };
};

describe("netDelta", () => {
  it.each(employees.map((e) => [e.id] as const))("%s: the components sum exactly to the net change", (id) => {
    const { option } = compare(id);
    expect(option.diffVsToday).toBeDefined();
    const sum = option.netDelta!.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBe(option.diffVsToday);
  });

  it.each(employees.map((e) => [e.id] as const))("%s: fixed order, one line per changed component, no zero lines", (id) => {
    const { option } = compare(id);
    const kinds = option.netDelta!.map((l) => l.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(ORDER.filter((k) => option.changes.some((c) => c.kind === k)));
    for (const l of option.netDelta!) expect(l.amount).not.toBe(0);
  });

  it("participation is a net deduction: its line is exactly the change in participation", () => {
    expect(config.rules.netMethod.participation.reducesValueOfUse).toBe(false);
    for (const e of employees) {
      const { today, option } = compare(e.id);
      const line = option.netDelta!.find((l) => l.kind === "participation");
      if (today.participation === option.participation) expect(line).toBeUndefined();
      else expect(line!.amount).toBe(today.participation - option.participation);
    }
  });

  it("the EV refund line is the rules' net bonus (gross-up), last in order", () => {
    expect(config.rules.electric.method).toBe("gross_up");
    const { option } = compare("E-001");
    const ev = option.netDelta!.at(-1)!;
    expect(ev.kind).toBe("electric");
    expect(ev.amount).toBeCloseTo(config.rules.electric.netBonus, 6);
  });

  it("giving up the car (E-005): participation, value-of-use tax saved, allowance after tax, all up", () => {
    const { today, option } = compare("E-005");
    expect(option.netDelta!.map((l) => l.kind)).toEqual(["participation", "valueOfUse", "maintenance"]);
    for (const l of option.netDelta!) expect(l.amount).toBeGreaterThan(0);
    const [, vou, maint] = option.netDelta!;
    // Not the gross amounts: tax saved is less than the value-of-use, the allowance after tax less than the allowance.
    expect(vou.amount).toBeLessThan(today.valueOfUse);
    expect(maint.amount).toBeLessThan(option.maintenance);
  });

  it("no change → no lines; no net (missing data or not eligible) → no netDelta", () => {
    const e = employees[0];
    const current = e.profile.current as Extract<Situation, { kind: "car" }>;
    const same = compareOptions(e.profile, [current], config).options[0];
    expect(same.netDelta).toEqual([]);
    const higher = config.catalog.cars.find((c) => c.group === "ד")!;
    expect(compareOptions(e.profile, [{ kind: "car", carId: higher.id }], config).options[0].netDelta).toBeUndefined();
    const noSalary = { ...e.profile, baseSalary: undefined };
    expect(compareOptions(noSalary, [asRequested(e.alternative)], config).options[0].netDelta).toBeUndefined();
  });

  it("is deterministic", () => {
    expect(compare("E-002").option.netDelta).toEqual(compare("E-002").option.netDelta);
  });
});
