import type { Car, Group, Occupation, Situation } from "@/lib/config/schemas";
import type { AllowedCars, EmployeeProfile, Eligibility, EngineConfig, MissingField, Track } from "./types";

const MISSING_REASON = "חסרים נתונים לבדיקת הזכאות";

const pct = (fraction: number) => `${+(fraction * 100).toFixed(2)}%`;

export function findOccupation(profile: EmployeeProfile, config: EngineConfig): Occupation | undefined {
  return config.occupations.occupations.find((o) => o.name === profile.occupation);
}

export function findCar(carId: string, config: EngineConfig): Car | undefined {
  return config.catalog.cars.find((c) => c.id === carId);
}

/** Employee's group: as stated if it exists in rules, else the occupation's group (data, not a guess). */
export function resolveGroup(profile: EmployeeProfile, config: EngineConfig): Group | undefined {
  const { groupOrder } = config.rules;
  if (profile.group !== undefined) return groupOrder.includes(profile.group) ? profile.group : undefined;
  return findOccupation(profile, config)?.group;
}

export function isFamilyCar(car: Car, config: EngineConfig): boolean {
  return config.rules.familyTrack.cars.includes(car.id);
}

const missingResult = (track: Track, missing: MissingField[]): Eligibility => ({
  eligible: false,
  track,
  reason: MISSING_REASON,
  missing,
});

/** TECH-DESIGN §4: waiver → family car → regular car. Missing data is reported, never guessed. */
export function checkEligibility(profile: EmployeeProfile, situation: Situation, config: EngineConfig): Eligibility {
  const { rules } = config;

  if (situation.kind === "waiver") {
    const occ = findOccupation(profile, config);
    if (!occ) return missingResult("waiver", ["occupation"]);
    if (occ.carMandatory) {
      return { eligible: false, track: "waiver", reason: "העיסוק מחייב רכב צמוד (רכב חובה) - אין אפשרות ויתור", missing: [] };
    }
    if (!occ.waiverAllowed) {
      return { eligible: false, track: "waiver", reason: "העיסוק אינו מאפשר ויתור על הרכב", missing: [] };
    }
    return { eligible: true, track: "waiver", reason: "העיסוק מאפשר ויתור", missing: [] };
  }

  const car = findCar(situation.carId, config);
  if (!car) return missingResult("regular", ["carId"]);
  const group = resolveGroup(profile, config);

  if (isFamilyCar(car, config)) {
    const ft = rules.familyTrack;
    const missing: MissingField[] = [];
    if (profile.childrenUnder23 === undefined) missing.push("childrenUnder23");
    if (group === undefined) missing.push("group"); // the gap is measured against the group budget
    if (missing.length) return missingResult("family", missing);
    const n = profile.childrenUnder23!;
    if (n < ft.minChildren) {
      return {
        eligible: false,
        track: "family",
        reason: `מסלול ברוכת ילדים מיועד ל-${ft.minChildren} ילדים ומעלה עד גיל ${ft.childMaxAge} (דווחו ${n})`,
        missing: [],
      };
    }
    return {
      eligible: true,
      track: "family",
      reason: `מסלול ברוכת ילדים (${n} ילדים); על הפער מעל התקציב - ${pct(ft.gapSplitEmployee)} עובד`,
      missing: [],
    };
  }

  if (group === undefined) return missingResult("regular", ["group"]);
  if (rules.groupOrder.indexOf(car.group) <= rules.groupOrder.indexOf(group)) {
    return { eligible: true, track: "regular", reason: "הרכב מהקבוצה שלך או נמוכה ממנה", missing: [] };
  }
  return {
    eligible: false,
    track: "regular",
    reason: `הרכב בקבוצה ${car.group}, מעל הקבוצה שלך (${group}); אפשר לבחור מקבוצה ${group} ומטה`,
    missing: [],
  };
}

/** Cars the employee may choose (F3): own group and lower, plus family-track cars when eligible. */
export function allowedCars(profile: EmployeeProfile, config: EngineConfig): AllowedCars {
  const { rules, catalog } = config;
  const group = resolveGroup(profile, config);
  if (group === undefined) return { cars: [], missing: ["group"] };

  const maxIdx = rules.groupOrder.indexOf(group);
  const n = profile.childrenUnder23;
  const familyOk = n !== undefined && n >= rules.familyTrack.minChildren;
  const cars = catalog.cars.filter((c) => {
    if (isFamilyCar(c, config)) return familyOk;
    const idx = rules.groupOrder.indexOf(c.group);
    return idx !== -1 && idx <= maxIdx;
  });
  return { cars, missing: n === undefined ? ["childrenUnder23"] : [] };
}
