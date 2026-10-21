import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { PAYSLIP_FIELDS, parseExtraction, sanitizeExtraction, type PayslipFields } from "@/lib/payslip/schema";

// F6: what the model may return from a payslip, and the no-guessing filter on top of it.
const config = loadConfig();
const ranges = config.rules.payslip.ranges;

const e1Fields: PayslipFields = { baseSalary: 18500, commissions: 0, bonus: 0, pensionPct: 6, studyFundPct: 2.5, creditPoints: 2.75 };
const ok = (fields: Partial<Record<string, unknown>> = {}) => ({ document: "payslip" as const, fields: { ...e1Fields, ...fields } as PayslipFields });

describe("payslip extraction schema", () => {
  it("accepts the six fields, each a number or null", () => {
    expect(parseExtraction(ok())).toEqual(ok());
    const allNull = Object.fromEntries(PAYSLIP_FIELDS.map((f) => [f, null]));
    expect(parseExtraction({ document: "payslip", fields: allNull })).toEqual({ document: "payslip", fields: allNull });
  });

  it.each(["idNumber", "employeeName", "bankAccount", "childrenUnder23", "participation"])("rejects an extra field %s", (key) => {
    expect(parseExtraction(ok({ [key]: key === "employeeName" ? "ישראל ישראלי" : 123456789 }))).toBeNull();
  });

  it("rejects extra keys at the top level too", () => {
    expect(parseExtraction({ ...ok(), employee: { name: "x", id: "000000000" } })).toBeNull();
  });

  it("rejects a missing field, a string number and an unknown document kind", () => {
    const noBonus = Object.fromEntries(Object.entries(e1Fields).filter(([k]) => k !== "bonus"));
    expect(parseExtraction({ document: "payslip", fields: noBonus })).toBeNull();
    expect(parseExtraction(ok({ baseSalary: "18500" }))).toBeNull();
    expect(parseExtraction({ ...ok(), document: "invoice" })).toBeNull();
  });
});

describe("sanitizeExtraction (no guessing)", () => {
  it("keeps in-range values exactly", () => {
    expect(sanitizeExtraction(ok({ baseSalary: 18500.5 }), ranges)).toEqual({ status: "ok", fields: { ...e1Fields, baseSalary: 18500.5 } });
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
    expect(res).toEqual({ status: "ok", fields: { ...e1Fields, [field]: null } });
  });

  it("not a payslip / unreadable → no fields at all", () => {
    expect(sanitizeExtraction({ ...ok(), document: "not_payslip" }, ranges)).toEqual({ status: "not_payslip" });
    expect(sanitizeExtraction({ ...ok(), document: "unreadable" }, ranges)).toEqual({ status: "unreadable" });
  });

  it("a payslip with nothing readable is unreadable", () => {
    const allNull = Object.fromEntries(PAYSLIP_FIELDS.map((f) => [f, null])) as PayslipFields;
    expect(sanitizeExtraction({ document: "payslip", fields: allNull }, ranges)).toEqual({ status: "unreadable" });
    expect(sanitizeExtraction(ok({ ...allNull, pensionPct: 600 }), ranges)).toEqual({ status: "unreadable" });
  });

  it("the ranges come from the rules data: a narrower range changes the result without code", () => {
    const narrow = { ...ranges, baseSalary: { min: 1, max: 10000 } };
    expect(sanitizeExtraction(ok(), narrow)).toMatchObject({ fields: { baseSalary: null } });
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
    expect(sanitizeExtraction({ document: "payslip", fields }, ranges)).toEqual({ status: "ok", fields });
  });
});
