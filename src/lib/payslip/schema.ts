import { z } from "zod";
import type { ProfileField } from "@/lib/agent/schemas";
import type { Rules } from "@/lib/config";

/**
 * F6: what the model may return from a payslip. Only these six fields: strict objects, so the JSON schema the model
 * gets has `additionalProperties: false` (no name, ID or bank fields to fill), and a response with any extra key
 * fails the parse. Percent fields as printed on the payslip (6 for 6%), the same as the form and updateProfile.
 */
export const PAYSLIP_FIELDS = ["baseSalary", "commissions", "bonus", "pensionPct", "studyFundPct", "creditPoints"] as const satisfies readonly ProfileField[];
export type PayslipField = (typeof PAYSLIP_FIELDS)[number];

const value = z.number().nullable();
export const PayslipExtractionSchema = z.strictObject({
  document: z.enum(["payslip", "not_payslip", "unreadable"]),
  fields: z.strictObject({
    baseSalary: value,
    commissions: value,
    bonus: value,
    pensionPct: value,
    studyFundPct: value,
    creditPoints: value,
  }),
});
export type PayslipExtraction = z.infer<typeof PayslipExtractionSchema>;
export type PayslipFields = PayslipExtraction["fields"];

export type PayslipResult = { status: "ok"; fields: PayslipFields } | { status: "not_payslip" | "unreadable" };

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
 * No guessing (hard rule 2): a value outside its range (rules.payslip.ranges) becomes null, never clamped or
 * rounded. Not a payslip, or a payslip with nothing usable → no fields at all.
 */
export function sanitizeExtraction(extraction: PayslipExtraction, ranges: Ranges): PayslipResult {
  if (extraction.document !== "payslip") return { status: extraction.document };
  const fields = Object.fromEntries(
    PAYSLIP_FIELDS.map((f) => {
      const v = extraction.fields[f];
      return [f, v !== null && inRange(v, ranges[f]) ? v : null];
    }),
  ) as PayslipFields;
  if (PAYSLIP_FIELDS.every((f) => fields[f] === null)) return { status: "unreadable" };
  return { status: "ok", fields };
}
