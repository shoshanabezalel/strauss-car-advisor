import type { GapType } from "./types";

/** Hebrew labels for the rep screen's information gaps tab (and the CSV export). */
export const GAP_TYPE_LABELS: Record<GapType, string> = {
  no_data: "אין מידע",
  referred_to_rep: "הופנה לנציג/ת",
  unknown_vehicle: "רכב שאינו בקטלוג",
};
