import type { AgentEvent, RepField, ToolName } from "@/lib/agent";
import type { Track } from "@/lib/engine";

/** Hebrew UI text. Display only: no business values live here. */

export { FIELD_LABELS } from "@/lib/format/labels";

export const TOOL_LABELS: Record<ToolName, string> = {
  getCatalog: "בודק את קטלוג הרכבים",
  checkEligibility: "בודק זכאות",
  getValueOfUse: "מחפש שווי שימוש",
  searchValueOfUse: "מחפש רכב בטבלת שווי שימוש",
  updateProfile: "שומר את הפרטים",
  compareOptions: "מחשב השוואה",
  askRepresentative: "שולח שאלה לנציג/ת",
};

export const STATUS_LABELS: Record<Extract<AgentEvent, { type: "status" }>["status"], string> = {
  thinking: "חושב…",
  checking: "בודק שכל מספר מגיע מהחישוב…",
  regenerating: "מנסח את התשובה מחדש…",
  fallback: "המערכת עמוסה, עובר למודל גיבוי…",
};

export const TRACK_LABELS: Record<Track, string> = {
  regular: "מסלול רגיל",
  family: "מסלול משפחה ברוכת ילדים",
  waiver: "ויתור על רכב",
};

const shekel = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const unsigned = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0, signDisplay: "never" });

/** Formats a server-rounded value. No arithmetic: the number is shown as received. */
export const formatShekel = (n: number) => `${shekel.format(n)} ₪`;

/** The diff as words (עלייה / ירידה) and the unsigned amount, the same phrasing the agent uses. */
export function formatDiff(n: number, direction?: "up" | "down" | "none"): string {
  if (direction === "none") return "ללא שינוי";
  return `${direction === "down" ? "ירידה" : "עלייה"} של ${unsigned.format(n)} ₪`;
}

/** What the representative settled, per question field. */
export const REP_FIELD_DONE_LABELS: Record<RepField, string> = {
  participation: "ההשתתפות העצמית אושרה",
  current: "פרטי הרכב הנוכחי עודכנו",
  group: "קבוצת הזכאות עודכנה",
  occupation: "העיסוק עודכן",
};

/** Waiting / answered, for the representative-status strip. */
export const REP_FIELD_ASK_LABELS: Record<RepField, string> = {
  participation: "השתתפות עצמית ב-",
  current: "הרכב הנוכחי וההשתתפות בו",
  group: "קבוצת הזכאות",
  occupation: "העיסוק",
};
