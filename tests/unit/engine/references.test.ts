import { describe, expect, it } from "vitest";
import { loadConfig, type SampleEmployee } from "@/lib/config";
import { compareOptions } from "@/lib/engine";
import { displayDiff, roundShekel } from "@/lib/format/money";

// A1–A6: the six reference employees from the "חישובים" sheet. Expected values are read from
// data/sample-employees.json and must never be edited to make a test pass (CLAUDE.md rule 5).
const config = loadConfig();
const employees = config.employees.employees;

function run(e: SampleEmployee) {
  const { today, options } = compareOptions(e.profile, [e.alternative], config);
  return { today, alt: options[0] };
}

describe.each(employees.map((e) => [e.id, e] as const))("%s", (_id, e) => {
  it("net today and net in the alternative", () => {
    const { today, alt } = run(e);
    expect(roundShekel(today.breakdown!.net)).toBe(e.expected.netToday);
    expect(roundShekel(alt.breakdown!.net)).toBe(e.expected.netAlt);
  });

  it("income tax and NI + health", () => {
    const { today, alt } = run(e);
    expect(roundShekel(today.breakdown!.tax)).toBe(e.expected.taxToday);
    expect(roundShekel(alt.breakdown!.tax)).toBe(e.expected.taxAlt);
    expect(roundShekel(today.breakdown!.nationalInsurance + today.breakdown!.health)).toBe(e.expected.niHealthToday);
    expect(roundShekel(alt.breakdown!.nationalInsurance + alt.breakdown!.health)).toBe(e.expected.niHealthAlt);
  });

  it("EV gross and family-track gap", () => {
    const { alt } = run(e);
    expect(roundShekel(alt.electricGross)).toBe(e.expected.electricGross);
    expect(alt.familyGapEmployee).toBe(e.expected.familyGapEmployee);
  });

  it("eligibility and reason", () => {
    const { alt } = run(e);
    expect(alt.eligibility.eligible).toBe(e.expected.eligible);
    expect(alt.eligibility.reason).toBe(e.expected.reason);
    expect(alt.missing).toEqual([]);
  });

  it("diff: shown diff = rounded alt − rounded today (difference of the rounded values)", () => {
    const { today, alt } = run(e);
    expect(alt.diffVsToday).toBeCloseTo(alt.breakdown!.net - today.breakdown!.net, 9);
    expect(displayDiff(alt.breakdown!.net, today.breakdown!.net)).toBe(e.expected.diff);
  });
});

describe("diff rounding convention", () => {
  // Rows where rounding the exact diff would NOT reproduce the sheet. If this list is non-empty it proves the
  // sheet uses the difference of the rounded values; if empty, both conventions agree on the reference data.
  it("documents where round(exact diff) and diff-of-rounded disagree", () => {
    const disagree = employees
      .filter((e) => {
        const { today, alt } = run(e);
        return roundShekel(alt.diffVsToday!) !== displayDiff(alt.breakdown!.net, today.breakdown!.net);
      })
      .map((e) => e.id);
    expect(disagree).toEqual(ROUND_OF_DIFF_DISAGREES);
  });
});
// Computed from the engine's unrounded nets (not from the sheet); see TECH-DESIGN §3 "Rounding".
// E-003: exact diff −1938.681 → round = −1939, sheet −1938. E-006: 721.700 → 722, sheet 721.
const ROUND_OF_DIFF_DISAGREES: string[] = ["E-003", "E-006"];

describe("structured changes for the explanation", () => {
  const byId = Object.fromEntries(employees.map((e) => [e.id, e]));

  it("E-001: value-of-use down, EV refund added; participation unchanged is not listed", () => {
    const { alt } = run(byId["E-001"]);
    expect(alt.changes).toContainEqual({ kind: "valueOfUse", from: 4070, to: 3130 });
    expect(alt.changes.find((c) => c.kind === "electric")).toMatchObject({ from: 0 });
    expect(alt.changes.find((c) => c.kind === "participation")).toBeUndefined();
  });

  it("E-002: family-track gap appears", () => {
    const { alt } = run(byId["E-002"]);
    expect(alt.changes).toContainEqual({ kind: "familyGap", from: 0, to: 1150 });
    expect(alt.changes).toContainEqual({ kind: "participation", from: 250, to: 500 });
  });

  it("E-003: maintenance removed, value-of-use and participation added", () => {
    const { alt } = run(byId["E-003"]);
    expect(alt.changes).toContainEqual({ kind: "maintenance", from: 1500, to: 0 });
    expect(alt.changes).toContainEqual({ kind: "valueOfUse", from: 0, to: 2430 });
    expect(alt.changes).toContainEqual({ kind: "participation", from: 0, to: 250 });
  });

  it("E-005: waiver removes value-of-use and participation, adds maintenance", () => {
    const { alt } = run(byId["E-005"]);
    expect(alt.changes).toContainEqual({ kind: "valueOfUse", from: 4570, to: 0 });
    expect(alt.changes).toContainEqual({ kind: "maintenance", from: 0, to: 2000 });
    expect(alt.changes).toContainEqual({ kind: "participation", from: 350, to: 0 });
  });
});
