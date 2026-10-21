import type { z } from "zod";
import type { CompareOptionsOutput } from "./schemas";

type CompareOutput = z.output<typeof CompareOptionsOutput>;

/**
 * F4: the plain-Hebrew explanation of an option against today, built in code. One line per changed component, in
 * the engine's order (display.netDelta): what changed (the table's amounts) and its effect on the net. The effects
 * add up exactly to the net change shown, so the gross amounts are never read as a sum (user, 21/10). Every amount
 * is a `display` value of the two rows; nothing is computed here, values are only compared.
 */

type Today = CompareOutput["today"];
type Option = CompareOutput["options"][number];
type Display = Option["display"];
type Kind = NonNullable<Display["netDelta"]>[number]["kind"];

const fmt = (n: number) => n.toLocaleString("en-US");
const ils = (n: number) => `${fmt(n)} ₪`;

export const NO_CHANGE = "אין שינוי ברכיבים לעומת היום.";
const NOT_CASH = "שווי שימוש הוא לא כסף אלא סכום שמחויב במס";

/** The net effect in words, never a minus sign. */
const effect = (amount: number) => (amount === 0 ? "ללא שינוי בנטו" : `${amount > 0 ? "עלייה" : "ירידה"} של ${ils(Math.abs(amount))} בנטו`);

/** What changed, from the table's amounts. */
function what(kind: Kind, t: Today["display"], o: Display): string {
  switch (kind) {
    case "participation":
      if (o.participation === 0) return `אין השתתפות עצמית (היום ${ils(t.participation)}, ישירות מהנטו)`;
      if (t.participation === 0) return `נוספת השתתפות עצמית של ${ils(o.participation)}, שיורדת ישירות מהנטו`;
      return `ההשתתפות העצמית ${o.participation > t.participation ? "עולה" : "יורדת"} מ-${fmt(t.participation)} ל-${ils(o.participation)} (ישירות מהנטו)`;
    case "valueOfUse":
      if (o.valueOfUse === 0) return `אין יותר שווי שימוש (היום ${ils(t.valueOfUse)}). ${NOT_CASH}, ולכן המס, הביטוח הלאומי ומס הבריאות יורדים`;
      if (t.valueOfUse === 0) return `נוסף שווי שימוש של ${ils(o.valueOfUse)}. ${NOT_CASH}, ולכן המס, הביטוח הלאומי ומס הבריאות עולים`;
      {
        const up = o.valueOfUse > t.valueOfUse;
        return `שווי השימוש ${up ? "עולה" : "יורד"} מ-${fmt(t.valueOfUse)} ל-${ils(o.valueOfUse)}. ${NOT_CASH}, ולכן המס ${up ? "עולה" : "יורד"}`;
      }
    case "maintenance":
      if (t.maintenance === 0) return `במקום רכב מקבלים אחזקת רכב של ${ils(o.maintenance)} (חייבת במס, לא פנסיונית), אחרי מס`;
      if (o.maintenance === 0) return `אחזקת הרכב (${ils(t.maintenance)}) מתבטלת, אחרי מס`;
      return `אחזקת הרכב משתנה מ-${fmt(t.maintenance)} ל-${ils(o.maintenance)}, אחרי מס`;
    case "familyGap":
      if (o.familyGapEmployee === 0) return `חלקך בפער מסלול המשפחה (${ils(t.familyGapEmployee)}) מתבטל`;
      return `חלקך בפער מסלול המשפחה: ${ils(o.familyGapEmployee)} בחודש`;
    case "electric":
      if (t.electricGross === 0) return `נוסף החזר חשמל מגולם (${ils(o.electricGross)} ברוטו)`;
      if (o.electricGross === 0) return `החזר החשמל (${ils(t.electricGross)} ברוטו) מתבטל`;
      return `החזר החשמל המגולם משתנה מ-${fmt(t.electricGross)} ל-${ils(o.electricGross)} ברוטו`;
  }
}

/** One line per changed component. Not eligible → the engine's reason. No net (missing data) → no lines. */
export function explainOption(today: Today, option: Option): string[] {
  if (!option.eligibility.eligible) return [option.eligibility.reason];
  const lines = option.display.netDelta;
  if (option.display.net === undefined || today.display.net === undefined || !lines) return [];
  if (!lines.length) return [NO_CHANGE];
  return lines.map(({ kind, amount }) => `${what(kind, today.display, option.display)}: ${effect(amount)}.`);
}
