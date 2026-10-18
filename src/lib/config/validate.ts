import { ConfigError } from "./parse";
import type { Catalog, ChallengeScript, Occupations, Rules, SampleEmployees } from "./schemas";

export interface Config {
  rules: Rules;
  catalog: Catalog;
  occupations: Occupations;
  employees: SampleEmployees;
  challenge: ChallengeScript;
}

/** Cross-file invariants that a single schema cannot express. Throws ConfigError listing every issue. */
export function validateConfig(cfg: Config): Config {
  const { rules, catalog, occupations, employees, challenge } = cfg;
  const issues: string[] = [];
  const groups = new Set(rules.groupOrder);
  const familyCars = new Set(rules.familyTrack.cars);
  const carsById = new Map(catalog.cars.map((c) => [c.id, c]));

  for (const g of rules.groupOrder) {
    if (!(g in rules.budgets)) issues.push(`rules: missing budget for group "${g}"`);
  }

  const seenCars = new Set<string>();
  for (const car of catalog.cars) {
    if (seenCars.has(car.id)) issues.push(`catalog: duplicate car id ${car.id}`);
    seenCars.add(car.id);
    if (!groups.has(car.group) && !familyCars.has(car.id)) {
      issues.push(`catalog: ${car.id} has group "${car.group}" which is not in groupOrder and not a family-track car`);
    }
  }

  for (const id of rules.familyTrack.cars) {
    const car = carsById.get(id);
    if (!car) issues.push(`rules.familyTrack.cars: ${id} not found in catalog`);
    else if (groups.has(car.group)) issues.push(`rules.familyTrack.cars: ${id} is in regular group "${car.group}"`);
  }

  const occByName = new Map(occupations.occupations.map((o) => [o.name, o]));
  for (const o of occupations.occupations) {
    if (!groups.has(o.group)) issues.push(`occupation "${o.name}": unknown group "${o.group}"`);
    if (o.carMandatory && o.waiverAllowed) issues.push(`occupation "${o.name}": mandatory car but waiver allowed`);
  }

  for (const e of employees.employees) {
    const occ = occByName.get(e.profile.occupation);
    if (!occ) issues.push(`${e.id}: unknown occupation "${e.profile.occupation}"`);
    else if (occ.group !== e.profile.group) {
      issues.push(`${e.id}: group "${e.profile.group}" differs from occupation group "${occ.group}"`);
    }
    if (!groups.has(e.profile.group)) issues.push(`${e.id}: unknown group "${e.profile.group}"`);
    for (const [label, s] of [["current", e.profile.current], ["alternative", e.alternative]] as const) {
      if (s.kind === "car" && !carsById.has(s.carId)) issues.push(`${e.id}: ${label} car ${s.carId} not in catalog`);
      if (s.kind === "waiver" && occ && !occ.waiverAllowed && label === "current") {
        issues.push(`${e.id}: current waiver but occupation "${occ.name}" does not allow waiver`);
      }
    }
  }

  if (!groups.has(challenge.profile.group)) issues.push(`challenge: unknown group "${challenge.profile.group}"`);
  for (const [label, s] of [["current", challenge.profile.current], ["alternative", challenge.alternative]] as const) {
    if (s.kind === "car" && !carsById.has(s.carId)) issues.push(`challenge: ${label} car ${s.carId} not in catalog`);
  }
  if (!carsById.has(challenge.repAnswer.carId)) issues.push(`challenge: repAnswer car ${challenge.repAnswer.carId} not in catalog`);

  if (issues.length) throw new ConfigError(`Invalid configuration:\n - ${issues.join("\n - ")}`);
  return cfg;
}
