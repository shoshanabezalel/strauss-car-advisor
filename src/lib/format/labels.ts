import type { MissingField } from "@/lib/engine";

/** Hebrew names of profile fields, shared by the UI and the replies built in code. Display only. */
export const FIELD_LABELS: Record<MissingField, string> = {
  occupation: "עיסוק",
  group: "קבוצת זכאות",
  baseSalary: "שכר בסיס",
  commissions: "עמלות",
  bonus: "בונוס",
  pensionPct: "אחוז הפרשה לפנסיה",
  studyFundPct: "אחוז הפרשה לקרן השתלמות",
  creditPoints: "נקודות זיכוי",
  childrenUnder23: "מספר ילדים עד גיל עשרים ושלוש",
  current: "המצב היום (רכב או אחזקה)",
  carId: "הרכב המבוקש",
};

export const WAIVER_LABEL = "ויתור על רכב (אחזקת רכב)";
