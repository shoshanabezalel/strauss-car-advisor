import type { z } from "zod";
import type { Config } from "@/lib/config";
import { carName } from "./demo-messages";
import type { CompareOptionsOutput, FindOptionsOutput, RepAnswer } from "./schemas";

/**
 * Hebrew replies built in code from tool outputs, for the mock model and the representative-answer service.
 * Every number is quoted from a tool's `display` (or the validated answer); nothing is computed here.
 */

type Compare = z.output<typeof CompareOptionsOutput>;

const fmt = (n: number) => n.toLocaleString("en-US");

export const ASK_CONFIRM_LINE = "ההשתתפות העצמית עוד לא אושרה. לשלוח לצוות הרכב לאישור?";

/** "12,126 ₪ בחודש — 4,455 ₪ יותר מהיום" from the engine's display values; never a sign. */
function resultText(net: number, diff: number, direction: "up" | "down" | "none"): string {
  const change = direction === "none" ? "ללא שינוי מהיום" : `${fmt(Math.abs(diff))} ₪ ${direction === "up" ? "יותר" : "פחות"} מהיום`;
  return `${fmt(net)} ₪ בחודש — ${change}`;
}

/**
 * Only the short result (user, 22/10): the new net and the change from today, then one question only if needed.
 * No component lines: the breakdown lives in "איך זה מחושב?" alone.
 */
export function compareReply(c: Compare | undefined, config: Config): string {
  const opt = c?.options[0];
  if (!c || !opt) return "לא הצלחתי לחשב את ההשוואה. אפשר לנסות שוב?";
  if (c.options.length > 1) return optionsReply(c, config);
  if (!opt.eligibility.eligible) return `האפשרות הזו לא זמינה עבורך: ${opt.eligibility.reason}`;
  const { net, diffVsToday, direction } = opt.display;
  if (net === undefined || diffVsToday === undefined || direction === undefined || c.today.display.net === undefined) {
    return "חסרים לי עוד פרטים כדי לחשב את הנטו. אפשר להשלים אותם?";
  }
  const lines = [`הנטו החדש: ${resultText(net, diffVsToday, direction)}.`];
  if (opt.needsConfirmation) lines.push(ASK_CONFIRM_LINE);
  return lines.join("\n");
}

type Find = z.output<typeof FindOptionsOutput>;

/** F8: the search result, one line per car with the tool's own reason. */
export function findReply(f: Find | undefined): string {
  if (!f) return "לא הצלחתי לחפש לפי התנאים. אפשר לנסות שוב?";
  if (f.status === "missing") return "כדי לחפש רכבים לפי התנאים חסרים לי עוד פרטים. אפשר להשלים אותם?";
  const rows = f.matches.length ? f.matches : f.nearest;
  if (!rows.length) {
    return ["לא מצאתי רכב מהסוג הזה שאפשר לבחור.", ...f.notEligible.map((n) => `${n.label}: ${n.reason}`)].join("\n");
  }
  const lines = [f.matches.length ? "אלה הרכבים שמתאימים לתנאים, מהנטו הגבוה לנמוך:" : "אין רכב שעומד בכל התנאים. הכי קרובים:"];
  lines.push(...rows.map((r) => `${r.label}: ${r.reason}`));
  if (f.comparison?.options.some((o) => o.needsConfirmation)) {
    lines.push("ההשתתפות העצמית לפי ברירת המחדל בקטלוג, וצריך לאשר אותה מול צוות הרכב.");
  }
  lines.push("אפשר לבחור רכב להשוואה מלאה, או לשנות את התנאים.");
  return lines.join("\n");
}

const optionLabel = (config: Config, o: Compare["options"][number]) =>
  o.situation.kind === "car" ? carName(config, o.situation.carId) : "ויתור על רכב";

/** Several options: one short line each, then one question only if needed. */
export function optionsReply(c: Compare, config: Config): string {
  if (c.options.length <= 1) return compareReply(c, config);
  const lines = c.options.map((o) => {
    const name = optionLabel(config, o);
    if (!o.eligibility.eligible) return `${name}: לא זמין – ${o.eligibility.reason}`;
    const { net, diffVsToday, direction } = o.display;
    if (net === undefined || diffVsToday === undefined || direction === undefined) return `${name}: חסרים נתונים לחישוב`;
    return `${name}: ${resultText(net, diffVsToday, direction)}`;
  });
  if (c.options.some((o) => o.needsConfirmation)) lines.push(ASK_CONFIRM_LINE);
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
  lines.push(compare ? compareReply(compare, config) : "אפשר להמשיך בשיחה ולבקש השוואה.");
  return lines.join("\n");
}
