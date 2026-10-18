import type { z } from "zod";
import type { Config } from "@/lib/config";
import { carName } from "./demo-messages";
import type { CompareOptionsOutput, RepAnswer } from "./schemas";

/**
 * Hebrew replies built in code from tool outputs, for the mock model and the representative-answer service.
 * Every number is quoted from a tool's `display` (or the validated answer); nothing is computed here.
 */

type Compare = z.output<typeof CompareOptionsOutput>;

const fmt = (n: number) => n.toLocaleString("en-US");

const CHANGE_WORDS: Record<string, string> = {
  valueOfUse: "שווי השימוש משתנה",
  electric: "נוסף החזר חשמל מגולם",
  maintenance: "אחזקת הרכב משתנה",
  participation: "ההשתתפות העצמית משתנה",
  familyGap: "חלקך בפער של מסלול משפחה ברוכת ילדים",
};

/** First line: new net and the change (עלייה / ירידה, no sign); then why, from `changes`; then confirmation status. */
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
  const why = [...new Set(opt.changes.map((ch) => CHANGE_WORDS[ch.kind]).filter(Boolean))];
  if (why.length) lines.push(`מה משתנה: ${why.join(", ")}.`);
  if (opt.needsConfirmation) lines.push("ההשתתפות העצמית ברכב החדש לפי ברירת המחדל בקטלוג, וצריך לאשר אותה מול נציג/ת הרכב.");
  return lines.join("\n");
}

/** Used when a built reply fails the number-guard (should not happen). No digits. */
export const REP_ANSWERED_FALLBACK = "נציג/ת הרכב ענה/תה על השאלה, וההשוואה עודכנה. אפשר לראות את הסכומים בטבלה.";

function answerLine(answer: RepAnswer, config: Config): string {
  switch (answer.field) {
    case "participation":
      return `נציג/ת הרכב אישר/ה את ההשתתפות העצמית ב-${carName(config, answer.carId)}: ${fmt(answer.value)} ₪.`;
    case "current": {
      const s = answer.situation;
      if (s.kind === "waiver") return "נציג/ת הרכב עדכן/ה שהיום יש לך ויתור על רכב ואחזקת רכב.";
      const p = s.participation === undefined ? "" : `, השתתפות עצמית ${fmt(s.participation)} ₪`;
      return `נציג/ת הרכב עדכן/ה את הרכב שלך היום: ${carName(config, s.carId)}${p}.`;
    }
    case "group":
      return `נציג/ת הרכב עדכן/ה את קבוצת הזכאות שלך: ${answer.value}.`;
    case "occupation":
      return `נציג/ת הרכב עדכן/ה את העיסוק שלך: ${answer.value}.`;
  }
}

/** The employee's update after a representative answer: what was confirmed, then the recomputed comparison if any. */
export function repAnsweredReply({ answer, compare, config }: { answer: RepAnswer; compare?: Compare; config: Config }): string {
  const lines = [answerLine(answer, config)];
  lines.push(compare ? compareReply(compare) : "אפשר להמשיך בשיחה ולבקש השוואה.");
  return lines.join("\n");
}
