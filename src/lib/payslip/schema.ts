import { z } from "zod";
import type { ProfileField } from "@/lib/agent/schemas";
import type { Rules } from "@/lib/config";

/**
 * F6: what the model may return from a payslip: printed values only, never a computed one. Strict objects, so the
 * JSON schema the model gets has `additionalProperties: false` (no name, ID or bank fields to fill), and a response
 * with any extra key fails the parse. Percents as printed (6 for 6%), the same as the form and updateProfile.
 * When a fund's rate isn't printed, the model returns the employee's deduction and the fund wage (שכר לגמל) as
 * printed, and the code computes the rate (sanitizeExtraction).
 */
export const PAYSLIP_FIELDS = ["baseSalary", "commissions", "bonus", "pensionPct", "studyFundPct", "creditPoints"] as const satisfies readonly ProfileField[];
export type PayslipField = (typeof PAYSLIP_FIELDS)[number];

/** Lines the model may report as not on the payslip at all (→ 0, user decision 21/10). */
const ABSENT_LINES = ["commissions", "bonus"] as const;

const value = z.number().nullable();
const RawFieldsSchema = z.strictObject({
  baseSalary: value,
  commissions: value,
  bonus: value,
  pensionPct: value,
  pensionDeduction: value,
  pensionWage: value,
  studyFundPct: value,
  studyFundDeduction: value,
  studyFundWage: value,
  creditPoints: value,
});
export const RAW_FIELDS = Object.keys(RawFieldsSchema.shape) as (keyof z.infer<typeof RawFieldsSchema>)[];
export type RawFields = z.infer<typeof RawFieldsSchema>;

export const PayslipExtractionSchema = z.strictObject({
  document: z.enum(["payslip", "not_payslip", "unreadable"]),
  fields: RawFieldsSchema,
  absentLines: z.array(z.enum(ABSENT_LINES)),
});
export type PayslipExtraction = z.infer<typeof PayslipExtractionSchema>;

export type PayslipFields = Record<PayslipField, number | null>;
/** computed: the rate came from printed amounts; not_on_payslip: no such line, so 0. */
export type PayslipNote = "computed" | "not_on_payslip";
export type PayslipNotes = Partial<Record<PayslipField, PayslipNote>>;

export type PayslipResult = { status: "ok"; fields: PayslipFields; notes: PayslipNotes } | { status: "not_payslip" | "unreadable" };

type Ranges = Rules["payslip"]["ranges"];

/** The model's raw output, or null when it isn't exactly the contract (an extra key included). */
export function parseExtraction(raw: unknown): PayslipExtraction | null {
  const parsed = PayslipExtractionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function inRange(v: number, r: Ranges[PayslipField]): boolean {
  if (!Number.isFinite(v) || v < r.min || v > r.max) return false;
  if (r.step === undefined) return true;
  const steps = v / r.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/**
 * A fund rate from printed amounts: employee deduction / fund wage × 100, to 2 decimals (the user's rule for a
 * value read off a payslip). A deduction of 0 is 0% even without a wage. Missing or implausible amounts → null.
 */
function rateFromAmounts(deduction: number | null, wage: number | null): number | null {
  if (deduction === null || !Number.isFinite(deduction) || deduction < 0) return null;
  if (deduction === 0) return 0;
  if (wage === null || !Number.isFinite(wage) || wage <= 0 || deduction > wage) return null;
  return Math.round((deduction / wage) * 10000) / 100;
}

/**
 * No guessing (hard rule 2): a value outside its range (rules.payslip.ranges) becomes null, never clamped. A fund
 * rate that isn't printed is computed here from the printed amounts, then range-checked the same way. Commissions or
 * bonus the model reports as absent from a readable payslip become 0 with a note. Not a payslip, or a payslip with
 * nothing usable → no fields at all.
 */
export function sanitizeExtraction(extraction: PayslipExtraction, ranges: Ranges): PayslipResult {
  if (extraction.document !== "payslip") return { status: extraction.document };
  const raw = extraction.fields;
  const notes: PayslipNotes = {};
  const candidates: PayslipFields = {
    baseSalary: raw.baseSalary,
    commissions: raw.commissions,
    bonus: raw.bonus,
    pensionPct: raw.pensionPct ?? rateFromAmounts(raw.pensionDeduction, raw.pensionWage),
    studyFundPct: raw.studyFundPct ?? rateFromAmounts(raw.studyFundDeduction, raw.studyFundWage),
    creditPoints: raw.creditPoints,
  };
  const fields = Object.fromEntries(
    PAYSLIP_FIELDS.map((f) => {
      const v = candidates[f];
      return [f, v !== null && inRange(v, ranges[f]) ? v : null];
    }),
  ) as PayslipFields;
  for (const f of ["pensionPct", "studyFundPct"] as const) {
    if (raw[f] === null && fields[f] !== null) notes[f] = "computed";
  }
  if (PAYSLIP_FIELDS.every((f) => fields[f] === null)) return { status: "unreadable" };
  for (const f of extraction.absentLines) {
    if (raw[f] === null) {
      fields[f] = 0;
      notes[f] = "not_on_payslip";
    }
  }
  return { status: "ok", fields, notes };
}
