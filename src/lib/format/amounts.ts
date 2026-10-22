/** Thousands separators for display (12,026). Values are never changed, only how they are written. */

const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const SHEKEL = String.raw`(?:₪|ש״ח|ש"ח)`;
const AMOUNT_BEFORE = new RegExp(String.raw`(?<![\d.,])(\d{4,})((?:\.\d+)?\s*${SHEKEL})`, "g");
const AMOUNT_AFTER = new RegExp(String.raw`(${SHEKEL}\s*)(\d{4,})(?![\d,])`, "g");

/**
 * Groups plain amounts written next to ₪ in a reply ("12026 ₪" → "12,026 ₪"). Only amounts: years and codes
 * have no ₪ and stay as they are. Run after the number-guard; the guard reads both forms.
 */
export function groupShekelAmounts(text: string): string {
  return text.replace(AMOUNT_BEFORE, (_, n: string, rest: string) => group(n) + rest).replace(AMOUNT_AFTER, (_, pre: string, n: string) => pre + group(n));
}

/** A number input's text on blur: "18000" → "18,000". Anything that isn't a plain number is left for validation. */
export function formatNumberInput(s: string): string {
  const plain = s.replace(/,/g, "").trim();
  const m = /^(\d+)(\.\d+)?$/.exec(plain);
  return m ? group(m[1]) + (m[2] ?? "") : s;
}

/** Back to a number on save ("18,000" → 18000). Not a number → NaN, which the server rejects. */
export function parseNumberInput(s: string): number {
  const plain = s.replace(/,/g, "").trim();
  return plain === "" ? NaN : Number(plain);
}
