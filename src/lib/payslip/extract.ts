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
- fields, all for this month only, exactly as printed. Use null whenever a value is not clearly printed. Never estimate, compute, sum or infer a value.
  - baseSalary: the monthly base salary (שכר בסיס / משכורת בסיס) in ILS.
  - commissions: commissions (עמלות) in ILS this month; null if there is no such line.
  - bonus: bonus (בונוס / פרמיה) in ILS this month; null if there is no such line.
  - pensionPct: the EMPLOYEE's pension deduction rate (תגמולי עובד / פנסיה עובד), in percent as printed (6 for 6%). Not the employer's rate.
  - studyFundPct: the EMPLOYEE's study fund deduction rate (קרן השתלמות עובד), in percent as printed (2.5 for 2.5%). Not the employer's rate.
  - creditPoints: tax credit points (נקודות זיכוי).
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
