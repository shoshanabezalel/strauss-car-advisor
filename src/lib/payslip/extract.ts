import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { Rules } from "@/lib/config";
import { parseExtraction, PayslipExtractionSchema, sanitizeExtraction, type PayslipResult } from "./schema";

export interface PayslipFile {
  bytes: Uint8Array;
  /** From the file's magic bytes (upload.ts), never from its name. */
  mediaType: "application/pdf" | "image/jpeg" | "image/png";
  name: string;
}
export type Extractor = (file: PayslipFile, abortSignal?: AbortSignal) => Promise<PayslipResult>;

/** Kept next to the code (not a .md file) so the deploy bundles it without a tracing entry. */
export const PAYSLIP_PROMPT = `You read one Israeli payslip (תלוש שכר) for a company-car advisor. Return only the JSON contract.

- document: "payslip" if this is a payslip; "not_payslip" if it is anything else; "unreadable" if it may be a payslip but you cannot read it.
- fields, all for this month only, exactly as printed. Use null whenever a value is not clearly printed. Never estimate, compute, sum or infer a value: copy printed numbers only.
  - baseSalary: the amount of the main regular salary line, in ILS. Its label varies: שכר יסוד, משכורת, שכר בסיס, שכר שעתי, ממ שוטף (hours × rate), or else the first regular salary line. Take its printed amount, not hours or the rate. Never travel (נסיעות), allowances (e.g. טלפון, ביגוד, אש"ל), overtime, one-off payments or totals.
  - commissions: commissions (עמלות) in ILS this month.
  - bonus: bonus (בונוס / פרמיה) in ILS this month.
  - pensionPct: the EMPLOYEE's pension deduction rate (תגמולי עובד / פנסיה עובד), in percent as printed (6 for 6%), only if a rate is printed. Not the employer's rate.
  - pensionDeduction: the EMPLOYEE's pension deduction amount in ILS as printed (in the deductions or the funds table).
  - pensionWage: the wage the pension is calculated on, as printed (שכר לגמל / שכר מבוטח / שכר לפנסיה).
  - studyFundPct, studyFundDeduction, studyFundWage: the same three for the study fund (קרן השתלמות עובד; its wage may be שכר לקה"ש or the same שכר לגמל line if that is the one printed for it).
  - creditPoints: tax credit points (נקודות זיכוי).
  - A value printed as 0 or 0.00 is 0, not null.
- absentLines: list "commissions" and/or "bonus" only when the payslip is clearly readable and has no such line at all (then leave that field null). A line that is there but unreadable is not absent.
- Do not return names, ID numbers, addresses, bank details or anything else.`;

/** The payslip read by the agent's model (same primary, retry and fallback as the chat). */
export function createModelExtractor(model: LanguageModel, ranges: Rules["payslip"]["ranges"]): Extractor {
  return async (file, abortSignal) => {
    let raw: unknown;
    try {
      const res = await generateText({
        model,
        output: Output.object({ schema: PayslipExtractionSchema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PAYSLIP_PROMPT },
              { type: "file", data: file.bytes, mediaType: file.mediaType },
            ],
          },
        ],
        // The fallback wrapper does the one retry (as in the chat route).
        maxRetries: 0,
        abortSignal,
      });
      raw = res.output;
    } catch (err) {
      // Output that isn't the contract (extra keys, not JSON) is not a guess we keep. Anything else is a call failure.
      if (NoObjectGeneratedError.isInstance(err)) return { status: "unreadable" };
      throw err;
    }
    const extraction = parseExtraction(raw);
    return extraction ? sanitizeExtraction(extraction, ranges) : { status: "unreadable" };
  };
}
