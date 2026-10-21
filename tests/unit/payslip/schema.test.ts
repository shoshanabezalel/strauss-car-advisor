import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { PAYSLIP_FIELDS, parseExtraction, RAW_FIELDS, sanitizeExtraction, type PayslipFields, type RawFields } from "@/lib/payslip/schema";

// F6: what the model may return from a payslip (printed values only), and the code on top of it:
// no-guessing ranges, fund percentages computed from printed amounts, and lines that aren't on the payslip.
const config = loadConfig();
const ranges = config.rules.payslip.ranges;

const NO_AMOUNTS = { pensionDeduction: null, pensionWage: null, studyFundDeduction: null, studyFundWage: null };
const e1Raw: RawFields = { baseSalary: 18500, commissions: 0, bonus: 0, pensionPct: 6, studyFundPct: 2.5, creditPoints: 2.75, ...NO_AMOUNTS };
const e1Fields: PayslipFields = { baseSalary: 18500, commissions: 0, bonus: 0, pensionPct: 6, studyFundPct: 2.5, creditPoints: 2.75 };
const ok = (fields: Partial<Record<string, unknown>> = {}, absentLines: ("commissions" | "bonus")[] = []) => ({
  document: "payslip" as const,
  fields: { ...e1Raw, ...fields } as RawFields,
  absentLines,
});
const allNull = Object.fromEntries(RAW_FIELDS.map((f) => [f, null])) as RawFields;

describe("payslip extraction schema", () => {
  it("accepts the printed values, each a number or null, and the absent lines", () => {
    expect(parseExtraction(ok())).toEqual(ok());
    expect(parseExtraction(ok(allNull, ["commissions", "bonus"]))).toEqual(ok(allNull, ["commissions", "bonus"]));
  });

  it.each(["idNumber", "employeeName", "bankAccount", "childrenUnder23", "participation"])("rejects an extra field %s", (key) => {
    expect(parseExtraction(ok({ [key]: key === "employeeName" ? "ישראל ישראלי" : 123456789 }))).toBeNull();
  });

  it("rejects extra keys at the top level, and an absent line that isn't commissions or bonus", () => {
    expect(parseExtraction({ ...ok(), employee: { name: "x", id: "000000000" } })).toBeNull();
    expect(parseExtraction({ ...ok(), absentLines: ["baseSalary"] })).toBeNull();
  });

  it("rejects a missing field, a string number and an unknown document kind", () => {
    const noBonus = Object.fromEntries(Object.entries(e1Raw).filter(([k]) => k !== "bonus"));
    expect(parseExtraction({ ...ok(), fields: noBonus })).toBeNull();
    expect(parseExtraction(ok({ baseSalary: "18500" }))).toBeNull();
    expect(parseExtraction({ ...ok(), document: "invoice" })).toBeNull();
  });
});

describe("sanitizeExtraction (no guessing)", () => {
  it("keeps in-range values exactly", () => {
    expect(sanitizeExtraction(ok({ baseSalary: 18500.5 }), ranges)).toEqual({ status: "ok", fields: { ...e1Fields, baseSalary: 18500.5 }, notes: {} });
  });

  it.each([
    ["pensionPct", 60],
    ["studyFundPct", 25],
    ["creditPoints", 2.3],
    ["creditPoints", 40],
    ["baseSalary", -1],
    ["baseSalary", 0],
    ["bonus", Number.POSITIVE_INFINITY],
  ])("%s = %s is out of range → null, never fixed", (field, value) => {
    const res = sanitizeExtraction(ok({ [field]: value }), ranges);
    expect(res).toEqual({ status: "ok", fields: { ...e1Fields, [field]: null }, notes: {} });
  });

  it("not a payslip / unreadable → no fields at all", () => {
    expect(sanitizeExtraction({ ...ok(), document: "not_payslip" }, ranges)).toEqual({ status: "not_payslip" });
    expect(sanitizeExtraction({ ...ok(), document: "unreadable" }, ranges)).toEqual({ status: "unreadable" });
  });

  it("a payslip with nothing readable is unreadable", () => {
    expect(sanitizeExtraction(ok(allNull), ranges)).toEqual({ status: "unreadable" });
    expect(sanitizeExtraction(ok({ ...allNull, pensionPct: 600 }), ranges)).toEqual({ status: "unreadable" });
  });

  it("the ranges come from the rules data: a narrower range changes the result without code", () => {
    const narrow = { ...ranges, baseSalary: { min: 1, max: 10000 } };
    expect(sanitizeExtraction(ok(), narrow)).toMatchObject({ fields: { baseSalary: null } });
  });
});

describe("fund percentages from printed amounts (computed in code, never by the model)", () => {
  it("no printed %: deduction / pension wage × 100, rounded to 2 decimals, marked as computed", () => {
    const res = sanitizeExtraction(ok({ pensionPct: null, pensionDeduction: 302.4, pensionWage: 5040 }), ranges);
    expect(res).toMatchObject({ status: "ok", fields: { pensionPct: 6 }, notes: { pensionPct: "computed" } });
    const odd = sanitizeExtraction(ok({ pensionPct: null, pensionDeduction: 100, pensionWage: 3000 }), ranges);
    expect(odd).toMatchObject({ fields: { pensionPct: 3.33 } });
  });

  it("the study fund the same way", () => {
    const res = sanitizeExtraction(ok({ studyFundPct: null, studyFundDeduction: 125, studyFundWage: 5000 }), ranges);
    expect(res).toMatchObject({ fields: { studyFundPct: 2.5 }, notes: { studyFundPct: "computed" } });
  });

  it("a printed % wins over the amounts", () => {
    const res = sanitizeExtraction(ok({ pensionPct: 6, pensionDeduction: 999, pensionWage: 5040 }), ranges);
    expect(res).toMatchObject({ fields: { pensionPct: 6 }, notes: {} });
  });

  it("a computed % is range-checked like a printed one", () => {
    const res = sanitizeExtraction(ok({ pensionPct: null, pensionDeduction: 1000, pensionWage: 5040 }), ranges);
    expect(res).toMatchObject({ fields: { pensionPct: null }, notes: {} });
  });

  it("no % and only one of the two amounts, a zero wage or a deduction above the wage → null", () => {
    for (const amounts of [
      { pensionDeduction: 302.4, pensionWage: null },
      { pensionDeduction: null, pensionWage: 5040 },
      { pensionDeduction: 302.4, pensionWage: 0 },
      { pensionDeduction: 6000, pensionWage: 5040 },
      { pensionDeduction: -5, pensionWage: 5040 },
    ]) {
      expect(sanitizeExtraction(ok({ pensionPct: null, ...amounts }), ranges)).toMatchObject({ fields: { pensionPct: null } });
    }
  });

  it("a deduction printed as 0.00 is 0%, with or without a wage", () => {
    expect(sanitizeExtraction(ok({ studyFundPct: null, studyFundDeduction: 0, studyFundWage: null }), ranges)).toMatchObject({ fields: { studyFundPct: 0 } });
    expect(sanitizeExtraction(ok({ studyFundPct: null, studyFundDeduction: 0, studyFundWage: 5040 }), ranges)).toMatchObject({ fields: { studyFundPct: 0 } });
    expect(sanitizeExtraction(ok({ studyFundPct: 0 }), ranges)).toMatchObject({ fields: { studyFundPct: 0 }, notes: {} });
  });
});

describe("commissions / bonus that aren't on a clearly read payslip", () => {
  it("→ 0 with a not-on-payslip note (decided by the user, 21/10)", () => {
    const res = sanitizeExtraction(ok({ commissions: null, bonus: null }, ["commissions", "bonus"]), ranges);
    expect(res).toEqual({ status: "ok", fields: { ...e1Fields, commissions: 0, bonus: 0 }, notes: { commissions: "not_on_payslip", bonus: "not_on_payslip" } });
  });

  it("a line that is there but unreadable stays null (not listed as absent)", () => {
    expect(sanitizeExtraction(ok({ bonus: null }), ranges)).toMatchObject({ fields: { bonus: null }, notes: {} });
  });

  it("a printed value wins over an absent claim", () => {
    expect(sanitizeExtraction(ok({ bonus: 800 }, ["bonus"]), ranges)).toMatchObject({ fields: { bonus: 800 }, notes: {} });
  });

  it("absent lines alone don't make an unreadable payslip readable", () => {
    expect(sanitizeExtraction(ok(allNull, ["commissions", "bonus"]), ranges)).toEqual({ status: "unreadable" });
  });
});

describe("the ranges hold every real value (reference employees + challenge script)", () => {
  // Percent fields as printed on a payslip (6 for 6%); the data keeps fractions. Rounded here only to undo float noise.
  const asPrinted = (p: Record<string, number>): PayslipFields => ({
    baseSalary: p.baseSalary,
    commissions: p.commissions,
    bonus: p.bonus,
    pensionPct: Math.round(p.pensionPct * 10000) / 100,
    studyFundPct: Math.round(p.studyFundPct * 10000) / 100,
    creditPoints: p.creditPoints,
  });
  const people = [
    ...config.employees.employees.map((e) => [e.id, e.profile] as const),
    ["challenge", config.challenge.profile] as const,
  ];

  it.each(people)("%s", (_id, profile) => {
    const fields = asPrinted(profile as unknown as Record<string, number>);
    expect(sanitizeExtraction(ok({ ...fields, ...NO_AMOUNTS }), ranges)).toEqual({ status: "ok", fields, notes: {} });
  });
});

it("PAYSLIP_FIELDS stays the six profile fields", () => {
  expect(PAYSLIP_FIELDS).toEqual(["baseSalary", "commissions", "bonus", "pensionPct", "studyFundPct", "creditPoints"]);
});
