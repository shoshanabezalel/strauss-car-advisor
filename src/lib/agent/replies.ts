import type { z } from "zod";
import type { Config } from "@/lib/config";
import { carName } from "./demo-messages";
import { explainOption } from "./explain";
import type { CompareOptionsOutput, RepAnswer } from "./schemas";

/**
 * Hebrew replies built in code from tool outputs, for the mock model and the representative-answer service.
 * Every number is quoted from a tool's `display` (or the validated answer); nothing is computed here.
 */

type Compare = z.output<typeof CompareOptionsOutput>;

const fmt = (n: number) => n.toLocaleString("en-US");

/** First line: new net and the change (עלייה / ירידה, no sign); then why (the table's explanation lines); then confirmation status. */
export function compareReply(c: Compare | undefined): string {
  const opt = c?.options[0];
  if (!c || !opt) return "לא הצלחתי לחשב את ההשוואה. אפשר לנסות שוב?";
  if (!opt.eligibility.eligible) return `האפשרות הזו לא זמינה עבורך: ${opt.eligibility.reason}`;
  const { net, diffVsToday, direction } = opt.display;
  if (net === undefined || diffVsToday === undefined || c.today.display.net === undefined) {
    return "חסרים לי עוד פרטים כדי לחשב את הנטו. אפשר להשלים אותם?";
  }
  const change =
    direction === "none" ? "ללא שינוי" : `${direction === "up" ? "עלייה" : "ירידה"} של ${fmt(Math.abs(diffVsToday))} ₪`;
  const lines = [`הנטו החדש שלך: ${fmt(net)} ₪, ${change} לעומת היום (${fmt(c.today.display.net)} ₪).`];
  lines.push(...explainOption(c.today, opt));
  if (opt.needsConfirmation) lines.push("ההשתתפות העצמית ברכב החדש לפי ברירת המחדל בקטלוג, וצריך לאשר אותה מול צוות הרכב.");
  return lines.join("\n");
}

const optionLabel = (config: Config, o: Compare["options"][number]) =>
  o.situation.kind === "car" ? carName(config, o.situation.carId) : "ויתור על רכב";

/** Several options: one line each (net and change, or why it's unavailable), then today's net. One option → compareReply. */
export function optionsReply(c: Compare, config: Config): string {
  if (c.options.length <= 1) return compareReply(c);
  const lines = c.options.map((o) => {
    const name = optionLabel(config, o);
    if (!o.eligibility.eligible) return `${name}: לא זמין – ${o.eligibility.reason}`;
    const { net, diffVsToday, direction } = o.display;
    if (net === undefined || diffVsToday === undefined) return `${name}: חסרים נתונים לחישוב`;
    const change = direction === "none" ? "ללא שינוי" : `${direction === "up" ? "עלייה" : "ירידה"} של ${fmt(Math.abs(diffVsToday))} ₪`;
    return `${name}: נטו ${fmt(net)} ₪, ${change}`;
  });
  if (c.today.display.net !== undefined) lines.push(`הנטו היום: ${fmt(c.today.display.net)} ₪.`);
  if (c.options.some((o) => o.needsConfirmation)) lines.push("ההשתתפות העצמית ברכב חדש לפי ברירת המחדל בקטלוג, וצריך לאשר אותה מול צוות הרכב.");
  return lines.join("\n");
}

/** After a direct profile edit: what was saved, then the recomputed comparison or what is still missing. */
export function profileUpdatedReply({ fields, compare, missing, config }: { fields: string[]; compare?: Compare; missing: string[]; config: Config }): string {
  const lines = [`עדכנתי: ${fields.join(", ")}.`];
  if (compare) lines.push(optionsReply(compare, config));
  else if (missing.length) lines.push(`כדי לחשב חסרים עוד: ${missing.join(", ")}.`);
  else lines.push("הפרטים מלאים. אפשר לבחור רכב להשוואה.");
  return lines.join("\n");
}

/** Used when a built reply fails the number-guard (should not happen). No digits. */
export const DIRECT_FALLBACK = "עדכנתי, וההשוואה חושבה מחדש. אפשר לראות את הסכומים בטבלה.";

/** Used when a built reply fails the number-guard (should not happen). No digits. */
export const REP_ANSWERED_FALLBACK = "צוות הרכב ענה על השאלה, וההשוואה עודכנה. אפשר לראות את הסכומים בטבלה.";

function answerLine(answer: RepAnswer, config: Config): string {
  switch (answer.field) {
    case "participation":
      return `צוות הרכב אישר את ההשתתפות העצמית ב-${carName(config, answer.carId)}: ${fmt(answer.value)} ₪.`;
    case "current": {
      const s = answer.situation;
      if (s.kind === "waiver") return "צוות הרכב עדכן שהיום יש לך ויתור על רכב ואחזקת רכב.";
      const p = s.participation === undefined ? "" : `, השתתפות עצמית ${fmt(s.participation)} ₪`;
      return `צוות הרכב עדכן את הרכב שלך היום: ${carName(config, s.carId)}${p}.`;
    }
    case "group":
      return `צוות הרכב עדכן את קבוצת הזכאות שלך: ${answer.value}.`;
    case "occupation":
      return `צוות הרכב עדכן את העיסוק שלך: ${answer.value}.`;
  }
}

/** The employee's update after a representative answer: what was confirmed, then the recomputed comparison if any. */
export function repAnsweredReply({ answer, compare, config }: { answer: RepAnswer; compare?: Compare; config: Config }): string {
  const lines = [answerLine(answer, config)];
  lines.push(compare ? compareReply(compare) : "אפשר להמשיך בשיחה ולבקש השוואה.");
  return lines.join("\n");
}
