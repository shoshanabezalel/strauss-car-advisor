import { describe, expect, it } from "vitest";
import { loadConfig, type Rules } from "@/lib/config";
import { compareOptions, computeElectricGross, computeNet, evaluateSituation, type NetInput } from "@/lib/engine";

const config = loadConfig();
const { rules } = config;
const clone = <T>(x: T): T => structuredClone(x);

function input(over: Partial<NetInput> = {}): NetInput {
  return {
    baseSalary: 0,
    commissions: 0,
    bonus: 0,
    pensionPct: 0,
    studyFundPct: 0,
    creditPoints: 0,
    valueOfUse: 0,
    maintenance: 0,
    electricGross: 0,
    participation: 0,
    familyGapEmployee: 0,
    ...over,
  };
}

// Hand-computed oracles from the 2025 tables in data/strauss-rules.json.
describe("net formula — edge cases", () => {
  it("below the NI threshold: low rates only; tax clamps to 0 when credits exceed it", () => {
    const b = computeNet(input({ baseSalary: 5000, creditPoints: 2.25 }), rules);
    expect(b.taxBrackets).toBeCloseTo(500, 9);
    expect(b.tax).toBe(0);
    expect(b.nationalInsurance).toBeCloseTo(52, 9); // 5000 × 1.04%
    expect(b.health).toBeCloseTo(161.5, 9); // 5000 × 3.23%
    expect(b.net).toBeCloseTo(4786.5, 9);
  });

  it("0 credit points: full bracket tax", () => {
    const b = computeNet(input({ baseSalary: 5000, creditPoints: 0 }), rules);
    expect(b.tax).toBeCloseTo(500, 9);
    expect(b.net).toBeCloseTo(4286.5, 9);
  });

  it("above the NI ceiling and in the open-ended top bracket", () => {
    const b = computeNet(input({ baseSalary: 70000 }), rules);
    expect(b.taxBrackets).toBeCloseTo(24035.2, 6);
    expect(b.nationalInsurance).toBeCloseTo(3100.3388, 6); // capped at 50,695
    expect(b.health).toBeCloseTo(2475.0047, 6);
    expect(b.net).toBeCloseTo(40389.4565, 6);
  });

  it("pension below the credit cap → partial pension credit", () => {
    const b = computeNet(input({ baseSalary: 9000, pensionPct: 0.03 }), rules);
    expect(b.pension).toBeCloseTo(270, 9);
    expect(b.pensionCredit).toBeCloseTo(94.5, 9); // 35% × 270
    expect(b.tax).toBeCloseTo(885.1, 9); // 979.6 − 94.5
  });

  it("pension above the cap → credit capped at 35% × 7% × 9,500 = 232.75", () => {
    const b = computeNet(input({ baseSalary: 18500, pensionPct: 0.06 }), rules);
    expect(b.pensionCredit).toBeCloseTo(232.75, 9);
  });

  it("pension and study fund are on cash only, not on value-of-use / maintenance / EV gross", () => {
    const b = computeNet(
      input({ baseSalary: 10000, commissions: 1000, bonus: 500, pensionPct: 0.06, studyFundPct: 0.025, valueOfUse: 3000, maintenance: 1500, electricGross: 400 }),
      rules,
    );
    expect(b.cash).toBe(11500);
    expect(b.pension).toBeCloseTo(690, 9);
    expect(b.studyFund).toBeCloseTo(287.5, 9);
    expect(b.taxable).toBe(11500 + 3000 + 1500 + 400);
  });

  it("participation and family gap are net deductions only", () => {
    const a = computeNet(input({ baseSalary: 12000, creditPoints: 2.25 }), rules);
    const b = computeNet(input({ baseSalary: 12000, creditPoints: 2.25, participation: 300, familyGapEmployee: 1150 }), rules);
    expect(b.tax).toBe(a.tax);
    expect(b.net).toBeCloseTo(a.net - 1450, 9);
  });
});

describe("EV refund", () => {
  // E-001 alternative (ATTO 3) before the EV component.
  const evBase = input({ baseSalary: 18500, pensionPct: 0.06, studyFundPct: 0.025, creditPoints: 2.75, valueOfUse: 3130, participation: 300 });

  it("gross_up: the employee nets exactly netBonus more", () => {
    const g = computeElectricGross(evBase, rules);
    const gain = computeNet({ ...evBase, electricGross: g }, rules).net - computeNet(evBase, rules).net;
    expect(gain).toBeCloseTo(rules.electric.netBonus, 6);
    expect(Math.round(g)).toBe(440);
  });

  it("flat: netBonus is added as taxable gross (employee nets less than netBonus)", () => {
    const flat: Rules = { ...clone(rules), electric: { ...rules.electric, method: "flat" } };
    const g = computeElectricGross(evBase, flat);
    expect(g).toBe(rules.electric.netBonus);
    const netFlat = computeNet({ ...evBase, electricGross: g }, flat).net;
    const netGrossUp = computeNet({ ...evBase, electricGross: computeElectricGross(evBase, rules) }, rules).net;
    // 250 gross at 31% tax + 7% NI + 5.17% health → 142.075 net, i.e. 107.925 less than gross_up.
    expect(netFlat - netGrossUp).toBeCloseTo(-107.925, 6);
  });

  it("method is chosen by rules: flat via config gives the flat result through the full pipeline", () => {
    const flatCfg = { ...config, rules: { ...clone(rules), electric: { ...rules.electric, method: "flat" as const } } };
    const e = config.employees.employees.find((x) => x.id === "E-001")!;
    const r = evaluateSituation(e.profile, e.alternative, flatCfg);
    expect(r.electricGross).toBe(rules.electric.netBonus);
  });

  it("non-electric drives (hybrid, plug-in, petrol) get no EV component", () => {
    const e = config.employees.employees.find((x) => x.id === "E-006")!; // group ד may take all of these
    for (const carId of ["CAR-18", "CAR-16", "CAR-15"]) {
      const r = evaluateSituation(e.profile, { kind: "car", carId, participation: 500 }, config);
      expect(r.electricGross, carId).toBe(0);
    }
  });
});

describe("purity & config-driven behaviour", () => {
  const deepFreeze = <T>(o: T): T => {
    if (o && typeof o === "object") {
      Object.values(o).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };

  it("same input → same output; inputs are not mutated", () => {
    const frozenCfg = deepFreeze(clone({ rules: config.rules, catalog: config.catalog, occupations: config.occupations }));
    const e = deepFreeze(clone(config.employees.employees[0]));
    const a = compareOptions(e.profile, [e.alternative], frozenCfg);
    const b = compareOptions(e.profile, [e.alternative], frozenCfg);
    expect(a).toEqual(b);
  });

  it("changing creditPointValue in rules changes the net — no code change", () => {
    const e = config.employees.employees.find((x) => x.id === "E-001")!;
    const base = evaluateSituation(e.profile, e.profile.current!, config).breakdown!.net;
    const r2 = clone(rules);
    r2.netMethod.creditPointValue += 10;
    const more = evaluateSituation(e.profile, e.profile.current!, { ...config, rules: r2 }).breakdown!.net;
    expect(more - base).toBeCloseTo(10 * e.profile.creditPoints, 9);
  });

  it("changing a group budget / gap split changes the family gap and its reason", () => {
    const e = config.employees.employees.find((x) => x.id === "E-002")!; // group ב, Carnival
    const r2 = clone(rules);
    r2.budgets["ב"] = 4000;
    r2.familyTrack.gapSplitEmployee = 0.3;
    const r = evaluateSituation(e.profile, e.alternative, { ...config, rules: r2 });
    expect(r.familyGapEmployee).toBeCloseTo((6000 - 4000) * 0.3, 9);
    expect(r.eligibility.reason).toContain("30%");
  });
});
