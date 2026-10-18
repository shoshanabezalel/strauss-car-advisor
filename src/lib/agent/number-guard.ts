import { roundShekel } from "@/lib/format/money";

/**
 * Number-guard (CLAUDE.md rule 1): every number in the agent's reply must come from a tool output of the same
 * turn, or from the validated profile. The guard only recognises display forms of those values (whole shekel,
 * up to two decimals, a fraction shown as a percent). It never adds or subtracts, so a number the model computed
 * itself is caught.
 */

export interface ExtractedNumber {
  /** The number as written, without sign, ₪ or % (e.g. "12,345"). */
  raw: string;
  /** Absolute value. Hebrew phrasing carries the sign ("ירידה של"), so signs are not compared. */
  value: number;
}

export interface GuardResult {
  ok: boolean;
  /** Raw spellings of numbers in the text that no allowed source contains. */
  invented: string[];
}

// Thousands-separated or plain digits, optional decimals; not starting or ending inside another number.
const NUMBER = /(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\d,]*\d)/g;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Numbers in the text, after removing known names whose digits are not numbers ("ATTO 3", "MG4"). */
export function extractNumbers(text: string, ignoreNames: readonly string[] = []): ExtractedNumber[] {
  let clean = text;
  for (const name of [...ignoreNames].filter((n) => /\d/.test(n)).sort((a, b) => b.length - a.length)) {
    clean = clean.replace(new RegExp(escapeRegex(name), "gi"), " ");
  }
  return [...clean.matchAll(NUMBER)].map(([raw]) => ({ raw, value: Number(raw.replace(/,/g, "")) }));
}

const key = (x: number) => String(Number(Math.abs(x).toFixed(6)));

function addForms(allowed: Set<string>, v: number) {
  const forms = [v];
  if (Math.abs(v) > 0 && Math.abs(v) < 1) forms.push(v * 100); // stored fraction shown as a percent
  for (const f of forms) {
    allowed.add(key(f));
    allowed.add(key(roundShekel(f)));
    allowed.add(key(Math.round(f * 10) / 10));
    allowed.add(key(Math.round(f * 100) / 100));
  }
}

/** Every number found in the sources: numeric leaves and numbers written inside string leaves, recursively. */
export function collectAllowed(sources: readonly unknown[]): Set<string> {
  const allowed = new Set<string>();
  const walk = (x: unknown) => {
    if (typeof x === "number" && Number.isFinite(x)) addForms(allowed, x);
    else if (typeof x === "string") for (const n of extractNumbers(x)) addForms(allowed, n.value);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  sources.forEach(walk);
  return allowed;
}

export function checkNumbers(
  text: string,
  allowedFrom: { toolOutputs: readonly unknown[]; profile?: unknown; ignoreNames?: readonly string[] },
): GuardResult {
  const allowed = collectAllowed([...allowedFrom.toolOutputs, allowedFrom.profile]);
  const invented = [
    ...new Set(
      extractNumbers(text, allowedFrom.ignoreNames)
        .filter((n) => !allowed.has(key(n.value)))
        .map((n) => n.raw),
    ),
  ];
  return { ok: invented.length === 0, invented };
}
