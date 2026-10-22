import type { ProfileField } from "@/lib/agent/schemas";

/** Shared by "הפרטים שלי" and the payslip confirm card. */
export const INPUT =
  "w-full min-w-0 min-h-11 rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-brand-orange md:text-sm dark:bg-input/30";

export const NUMBER_FIELDS = [
  { field: "baseSalary", label: "שכר בסיס (₪)", step: 1 },
  { field: "commissions", label: "עמלות (₪)", step: 1 },
  { field: "bonus", label: "בונוס (₪)", step: 1 },
  { field: "pensionPct", label: "הפרשה לפנסיה (%)", step: 0.1 },
  { field: "studyFundPct", label: "קרן השתלמות (%)", step: 0.1 },
  { field: "creditPoints", label: "נקודות זיכוי", step: 0.25 },
  { field: "childrenUnder23", label: "ילדים עד גיל עשרים ושלוש", step: 1 },
] as const satisfies readonly { field: ProfileField; label: string; step: number }[];
