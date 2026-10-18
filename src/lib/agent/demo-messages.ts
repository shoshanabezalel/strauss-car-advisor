import type { Config, SampleEmployee, Situation } from "@/lib/config";

/** Hebrew chat messages built from the sample data. Used by the mock model's triggers, the demo chips and the evals. */

const pct = (f: number) => +(f * 100).toFixed(2); // phrasing of sample data, not a calculation shown to anyone

export function carName(config: Config, id: string): string {
  const c = config.catalog.cars.find((x) => x.id === id);
  return c ? `${c.make} ${c.model}` : id;
}

function describeSituation(config: Config, s: Situation): string {
  if (s.kind === "waiver") return "היום ויתרתי על רכב ואני מקבל/ת אחזקת רכב.";
  const p = s.participation !== undefined ? ` עם השתתפות עצמית של ${s.participation} ₪` : "";
  return `היום יש לי ${carName(config, s.carId)}${p}.`;
}

/** One Hebrew message with the whole profile and the employee's question, as an employee might write it. */
export function openingMessage(config: Config, e: SampleEmployee): string {
  const p = e.profile;
  return [
    `שלום, אני ${p.occupation}, קבוצת זכאות ${p.group}.`,
    `שכר בסיס ${p.baseSalary} ₪, עמלות ${p.commissions} ₪, בונוס ${p.bonus} ₪.`,
    `הפרשה לפנסיה ${pct(p.pensionPct)}% ולקרן השתלמות ${pct(p.studyFundPct)}%.`,
    `יש לי ${p.creditPoints} נקודות זיכוי ו-${p.childrenUnder23} ילדים עד גיל עשרים ושלוש.`,
    describeSituation(config, p.current),
    e.question,
  ].join(" ");
}

/** A partial profile: only the group, so the agent has to ask for the rest. */
export function missingDataMessage(config: Config): string {
  return `שלום, אני בקבוצת זכאות ${config.employees.employees[0].profile.group}. מה יקרה לנטו אם אחליף רכב?`;
}

/** A12: the employee doesn't know their participation, so it goes to the representative. */
export const UNKNOWN_PARTICIPATION_MESSAGE = "אני לא יודע/ת מה ההשתתפות העצמית שלי ברכב הנוכחי. אפשר לברר?";

/** A car whose make/model codes match two tax-authority rows without the vehicle type code (ATTO 3 / TANG). */
export function ambiguousVouCar(config: Config) {
  return config.catalog.cars.find((c) => c.model === "ATTO 3")!;
}

export function ambiguousVouMessage(config: Config): string {
  const c = ambiguousVouCar(config);
  return `מה שווי השימוש של ${c.make} ${c.model} משנת ${c.regYear}?`;
}
