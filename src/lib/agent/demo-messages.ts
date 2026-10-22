import type { Config, SampleEmployee, Situation } from "@/lib/config";

/** Hebrew chat messages built from the sample data. Used by the mock model's triggers, the demo chips and the evals. */

const pct = (f: number) => +(f * 100).toFixed(2); // phrasing of sample data, not a calculation shown to anyone

export function carName(config: Config, id: string): string {
  const c = config.catalog.cars.find((x) => x.id === id);
  return c ? `${c.make} ${c.model}` : id;
}

function describeSituation(config: Config, s: Situation): string {
  if (s.kind === "waiver") return "היום ויתרתי על רכב, ויש לי אחזקת רכב.";
  const p = s.participation !== undefined ? ` עם השתתפות עצמית של ${s.participation} ₪` : "";
  return `היום יש לי ${carName(config, s.carId)}${p}.`;
}

type StatedProfile = Omit<SampleEmployee["profile"], "occupation"> & { occupation?: string };

function describeProfile(config: Config, p: StatedProfile, question: string): string {
  return [
    p.occupation ? `שלום, אני ${p.occupation}, קבוצת זכאות ${p.group}.` : `שלום, אני בקבוצת זכאות ${p.group}.`,
    `שכר בסיס ${p.baseSalary} ₪, עמלות ${p.commissions} ₪, בונוס ${p.bonus} ₪.`,
    `הפרשה לפנסיה ${pct(p.pensionPct)}% ולקרן השתלמות ${pct(p.studyFundPct)}%.`,
    `יש לי ${p.creditPoints} נקודות זיכוי ו-${p.childrenUnder23} ילדים עד גיל עשרים ושלוש.`,
    describeSituation(config, p.current),
    question,
  ].join(" ");
}

/** One Hebrew message with the whole profile and the employee's question, as an employee might write it. */
export function openingMessage(config: Config, e: SampleEmployee): string {
  return describeProfile(config, e.profile, e.question);
}

/** A7: the brief's script in one message (data/challenge-script.json), naming the EV the employee picked. */
export function challengeOpeningMessage(config: Config): string {
  const c = config.challenge;
  const pick = c.alternative.kind === "car" ? ` הרכב שמעניין אותי: ${carName(config, c.alternative.carId)}.` : "";
  return describeProfile(config, c.profile, c.question + pick);
}

/** A7 follow-up: the employee asks to confirm the new car's participation with the representative. */
export const ASK_REP_MESSAGE = "אפשר לבדוק מול צוות הרכב מה ההשתתפות העצמית ברכב החדש?";

/** A partial profile: only the group, so the agent has to ask for the rest. */
export function missingDataMessage(config: Config): string {
  return `שלום, אני בקבוצת זכאות ${config.employees.employees[0].profile.group}. מה יקרה לנטו אם אחליף רכב?`;
}

/** G: a question the rules don't cover: the agent says it has no information and logs a no_data gap. */
export const NO_DATA_MESSAGE = "האם הרכב הצמוד מכוסה בביטוח כשאני בחופשת לידה?";

/** A12: the employee doesn't know their participation, so it goes to the representative. */
export const UNKNOWN_PARTICIPATION_MESSAGE = "אין לי מידע מה ההשתתפות העצמית שלי ברכב הנוכחי. אפשר לברר?";

/** A car whose make/model codes match two tax-authority rows without the vehicle type code (ATTO 3 / TANG). */
export function ambiguousVouCar(config: Config) {
  return config.catalog.cars.find((c) => c.model === "ATTO 3")!;
}

export function ambiguousVouMessage(config: Config): string {
  const c = ambiguousVouCar(config);
  return `מה שווי השימוש של ${c.make} ${c.model} משנת ${c.regYear}?`;
}
