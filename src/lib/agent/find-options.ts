import type { z } from "zod";
import type { Config } from "@/lib/config";
import type { Constraints, FindResult, FoundOption, Miss } from "@/lib/engine";
import { roundShekel } from "@/lib/format/money";
import { carName } from "./demo-messages";
import type { CompareOptionsOutput, FindOptionsOutput, FoundOptionSchema } from "./schemas";

/**
 * F8: the findOptions tool output. Each car's reason is a fixed Hebrew template filled only with the
 * comparison's display values and the employee's own limits; nothing here decides fit (the engine did).
 */

type Compare = z.output<typeof CompareOptionsOutput>;
type Displayed = Compare["options"][number];
type Found = z.output<typeof FoundOptionSchema>;

const fmt = (n: number) => n.toLocaleString("en-US");
const shekels = (n: number) => `${fmt(n)} ₪`;

function changeText(d: Displayed["display"]): string {
  if (d.direction === "none") return "ללא שינוי בנטו";
  return `${d.direction === "up" ? "עלייה" : "ירידה"} של ${shekels(Math.abs(d.diffVsToday!))} בנטו`;
}

/** The miss in shown (rounded) shekels, so it matches the table: shown amount minus the limit. */
function shownMiss(m: Miss, d: Displayed["display"], c: Constraints): number {
  switch (m.kind) {
    case "netDrop":
      return -d.diffVsToday! - roundShekel(c.maxNetDrop!);
    case "netGain":
      return roundShekel(c.minNetGain!) - d.diffVsToday!;
    case "participation":
      return d.participation - roundShekel(c.maxParticipation!);
  }
}

/** "by X ₪", or "by less than a shekel" when the miss disappears in rounding. */
const byText = (n: number) => (n > 0 ? `ב-${shekels(n)}` : "בפחות משקל");

const MISS_TEXT: Record<Miss["kind"], (by: number, d: Displayed["display"], c: Constraints) => string> = {
  netDrop: (by, d, c) => `${changeText(d)}: חורג ${byText(by)} מהמגבלה של ירידה עד ${shekels(roundShekel(c.maxNetDrop!))}`,
  netGain: (by, d, c) => `${changeText(d)}: חסרים ${by > 0 ? shekels(by) : "פחות משקל"} כדי להגיע לעלייה של ${shekels(roundShekel(c.minNetGain!))}`,
  participation: (by, d, c) => `השתתפות עצמית ${shekels(d.participation)}: חורגת ${byText(by)} מהמקסימום של ${shekels(roundShekel(c.maxParticipation!))}`,
};

function found(f: FoundOption, row: Displayed, c: Constraints, config: Config): Found {
  const d = row.display;
  const misses = f.misses.map((m) => ({ ...m, display: shownMiss(m, d, c) }));
  const reason = misses.length
    ? misses.map((m) => MISS_TEXT[m.kind](m.display, d, c)).join("; ")
    : `מתאים לכל התנאים: ${changeText(d)}`;
  const carId = (f.option.situation as { carId: string }).carId;
  return { carId, label: carName(config, carId), fits: misses.length === 0, misses, reason };
}

/**
 * `compare` = the displayed comparison of the shown cars (matches, else nearest), in the same order.
 * `notEligible` rows carry the engine's eligibility reason.
 */
export function findOptionsOutput(
  r: FindResult,
  constraints: Constraints,
  compare: Compare | undefined,
  config: Config,
): z.input<typeof FindOptionsOutput> {
  if (r.missing.length) return { status: "missing", missing: r.missing };
  const shown = r.matches.length ? r.matches : r.nearest;
  const rows = shown.map((f, i) => found(f, compare!.options[i], constraints, config));
  const notEligible = r.notEligible.map((o) => {
    const carId = (o.situation as { carId: string }).carId;
    return { carId, label: carName(config, carId), fits: false, misses: [], reason: `אין זכאות: ${o.eligibility.reason}` };
  });
  return {
    status: "ok",
    constraints,
    matches: r.matches.length ? rows : [],
    nearest: r.matches.length ? [] : rows,
    notEligible,
    comparison: shown.length ? compare : undefined,
  };
}
