import type { GapTopic, GapType } from "./types";

/** Hebrew labels for the rep screen's information gaps tab (and the CSV export). */
export const GAP_TYPE_LABELS: Record<GapType, string> = {
  no_data: "אין מידע",
  referred_to_rep: "הופנה לצוות הרכב",
  pending_confirmation: "ממתין לאישור צוות הרכב",
  unknown_vehicle: "רכב שאינו בקטלוג",
};

const NO_DATA_TOPIC_LABELS: Record<GapTopic, string> = {
  rules: "כללי החברה",
  tax: "מיסוי",
  electric: "רכב חשמלי",
  family: "מסלול משפחה",
  waiver: "ויתור על רכב",
  eligibility: "זכאות",
  process: "תהליכים",
  other: "אחר",
};

const REP_TOPIC_LABELS: Record<string, string> = {
  current: "הרכב הנוכחי",
  group: "קבוצת הזכאות",
  occupation: "העיסוק",
};

/**
 * A topic key as people read it. Keys hold catalog ids (`participation/CAR-10`) for grouping; the screen, the CSV
 * and the AI analysis get the car's make and model instead, never the id. `vehicle` is the gap's stored car name.
 */
export function gapLabel(type: GapType, topic: string, vehicle?: string): string {
  if (topic.startsWith("participation/")) return `השתתפות עצמית: ${vehicle ?? "רכב מהקטלוג"}`;
  if (topic.startsWith("vehicle/")) return `רכב שאינו בקטלוג: ${vehicle ?? topic.slice("vehicle/".length)}`;
  if (type === "no_data") return NO_DATA_TOPIC_LABELS[topic as GapTopic] ?? topic;
  return REP_TOPIC_LABELS[topic] ?? topic;
}
