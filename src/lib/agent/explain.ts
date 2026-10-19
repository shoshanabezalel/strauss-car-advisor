import type { z } from "zod";
import type { CompareOptionsOutput } from "./schemas";

type CompareOutput = z.output<typeof CompareOptionsOutput>;

/**
 * F4: the two-line plain-Hebrew explanation of an option against today, built in code. Every amount is a `display`
 * value of the two rows (rounded by the compareOptions tool); nothing is computed here, values are only compared.
 * Line 1 is the tax side (value-of-use, maintenance allowance), line 2 the net side (EV refund, participation,
 * family-track gap).
 */

type Today = CompareOutput["today"];
type Option = CompareOutput["options"][number];

const fmt = (n: number) => n.toLocaleString("en-US");
const ils = (n: number) => `${fmt(n)} ₪`;

export const NO_CHANGE = "אין שינוי ברכיבים לעומת היום.";

function taxSide(t: Today["display"], o: Option["display"]): string[] {
  const parts: string[] = [];
  if (t.valueOfUse !== o.valueOfUse) {
    if (o.valueOfUse === 0) parts.push(`אין יותר שווי שימוש (היום ${ils(t.valueOfUse)}), ולכן המס יורד`);
    else if (t.valueOfUse === 0) parts.push(`נוסף שווי שימוש של ${ils(o.valueOfUse)}, ולכן המס עולה`);
    else {
      const up = o.valueOfUse > t.valueOfUse;
      parts.push(`שווי השימוש ${up ? "עולה" : "יורד"} מ-${fmt(t.valueOfUse)} ל-${ils(o.valueOfUse)}, ולכן המס ${up ? "עולה" : "יורד"}`);
    }
  }
  if (t.maintenance !== o.maintenance) {
    if (o.maintenance > 0) parts.push(`במקום רכב מקבלים אחזקת רכב של ${ils(o.maintenance)} (חייבת במס, לא פנסיונית)`);
    else parts.push(`אחזקת הרכב (${ils(t.maintenance)}) מתבטלת`);
  }
  return parts;
}

function netSide(t: Today["display"], o: Option["display"]): string[] {
  const parts: string[] = [];
  if (t.electricGross !== o.electricGross) {
    if (o.electricGross > 0) parts.push(`נוסף החזר חשמל מגולם של ${ils(o.electricGross)} ברוטו`);
    else parts.push(`החזר החשמל (${ils(t.electricGross)} ברוטו) מתבטל`);
  }
  if (t.participation !== o.participation) {
    if (o.participation === 0) parts.push(`אין השתתפות עצמית (היום ${ils(t.participation)})`);
    else if (t.participation === 0) parts.push(`נוספת השתתפות עצמית של ${ils(o.participation)}, שיורדת ישירות מהנטו`);
    else {
      const up = o.participation > t.participation;
      parts.push(`ההשתתפות העצמית ${up ? "עולה" : "יורדת"} מ-${fmt(t.participation)} ל-${ils(o.participation)} (ישירות מהנטו)`);
    }
  }
  if (t.familyGapEmployee !== o.familyGapEmployee && o.familyGapEmployee > 0) {
    parts.push(`חלקך בפער מסלול המשפחה: ${ils(o.familyGapEmployee)} בחודש`);
  }
  return parts;
}

const sentence = (parts: string[]) => `${parts.join("; ")}.`;

/** At most two lines. Not eligible → the engine's reason. No net (missing data) → no lines. */
export function explainOption(today: Today, option: Option): string[] {
  if (!option.eligibility.eligible) return [option.eligibility.reason];
  if (option.display.net === undefined || today.display.net === undefined) return [];
  const lines = [taxSide(today.display, option.display), netSide(today.display, option.display)].filter((p) => p.length).map(sentence);
  return lines.length ? lines : [NO_CHANGE];
}
