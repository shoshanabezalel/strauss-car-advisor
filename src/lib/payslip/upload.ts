import type { Extractor, PayslipFile } from "./extract";
import type { PayslipFields, PayslipNotes } from "./schema";

/** Vercel caps a request body at 4.5 MB; the form data around the file needs a little of it. */
export const MAX_PAYSLIP_BYTES = 4 * 1024 * 1024;

export type PayslipResponse =
  | { status: "ok"; fields: PayslipFields; notes: PayslipNotes }
  | { status: "not_payslip" | "unreadable" | "invalid" | "too_large" | "unsupported" | "failed"; message: string };

const MESSAGES = {
  invalid: "לא התקבל קובץ. אפשר לבחור קובץ PDF, JPG או PNG.",
  too_large: "הקובץ גדול מדי (עד 4MB). אפשר לצלם מסך של התלוש ולהעלות את התמונה.",
  unsupported: "אפשר להעלות רק קובץ PDF, JPG או PNG.",
  not_payslip: "הקובץ לא נראה כמו תלוש שכר. אפשר לנסות קובץ אחר או להקליד את הפרטים.",
  unreadable: "לא הצלחתי לקרוא את התלוש. אפשר לנסות צילום חד יותר או להקליד את הפרטים.",
  failed: "משהו השתבש בקריאת התלוש. אפשר לנסות שוב בעוד רגע או להקליד את הפרטים.",
} as const;

const fail = (status: number, kind: keyof typeof MESSAGES) => ({ status, body: { status: kind, message: MESSAGES[kind] } as PayslipResponse });

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** The media type from the file's first bytes; the name and the browser's declared type are not trusted. */
function sniff(bytes: Uint8Array): PayslipFile["mediaType"] | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

/**
 * F6: one uploaded payslip → the six fields for the employee to confirm. The file lives only in memory for this
 * call: nothing is stored, and a failure is logged by error name only (an SDK error can carry the request body,
 * i.e. the file in base64).
 */
export async function handlePayslipUpload(input: { file: File | null; extract: Extractor; abortSignal?: AbortSignal }): Promise<{ status: number; body: PayslipResponse }> {
  const { file, extract } = input;
  if (!file || file.size === 0) return fail(400, "invalid");
  if (file.size > MAX_PAYSLIP_BYTES) return fail(413, "too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniff(bytes);
  if (!mediaType) return fail(415, "unsupported");

  let result;
  try {
    result = await extract({ bytes, mediaType, name: file.name }, input.abortSignal);
  } catch (err) {
    console.error(`[payslip] extraction failed: ${err instanceof Error ? err.name : "unknown"}`);
    return fail(502, "failed");
  }
  if (result.status !== "ok") return fail(422, result.status);
  return { status: 200, body: { status: "ok", fields: result.fields, notes: result.notes } };
}
