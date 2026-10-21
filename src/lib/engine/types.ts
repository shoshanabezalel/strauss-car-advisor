import type { Car, Catalog, Group, Occupations, ParticipationSource, Rules, Situation } from "@/lib/config/schemas";

/** The slice of config the engine reads. Passed in explicitly — the engine never loads files. */
export interface EngineConfig {
  rules: Rules;
  catalog: Catalog;
  occupations: Occupations;
}

/** What we know about the employee so far. Every field may still be missing. */
export interface EmployeeProfile {
  occupation?: string;
  group?: Group;
  baseSalary?: number;
  commissions?: number;
  bonus?: number;
  pensionPct?: number; // fraction (6% → 0.06)
  studyFundPct?: number;
  creditPoints?: number;
  childrenUnder23?: number;
  current?: Situation;
}

/** Names of the data points the engine can report as missing (profile fields + the car itself). */
export type MissingField = keyof EmployeeProfile | "carId";

/** Fully resolved monthly input for one situation. */
export interface NetInput {
  baseSalary: number;
  commissions: number;
  bonus: number;
  pensionPct: number;
  studyFundPct: number;
  creditPoints: number;
  valueOfUse: number;
  maintenance: number;
  electricGross: number;
  participation: number;
  familyGapEmployee: number;
}

/** Unrounded result of the net calculation. */
export interface NetBreakdown {
  cash: number; // base + commissions + bonus
  pension: number;
  studyFund: number;
  taxable: number;
  taxBrackets: number;
  creditPointsValue: number;
  pensionCredit: number;
  tax: number;
  nationalInsurance: number;
  health: number;
  net: number;
}

export type Track = "regular" | "family" | "waiver";

export interface Eligibility {
  eligible: boolean;
  track: Track;
  reason: string; // Hebrew, user-facing
  missing: MissingField[];
}

export type ChangeKind = "valueOfUse" | "maintenance" | "participation" | "electric" | "familyGap";

/** A structured fact for the explanation ("value-of-use 4,070 → 3,130"). Only emitted when from ≠ to. */
export interface Change {
  kind: ChangeKind;
  from: number;
  to: number;
}

/** One component's effect on the net (unrounded, signed). The lines of an option sum exactly to diffVsToday. */
export interface NetDeltaLine {
  kind: ChangeKind;
  amount: number;
}

export interface OptionResult {
  situation: Situation;
  eligibility: Eligibility;
  car?: Car;
  budget?: number;
  carCost: number;
  participation: number;
  participationSource?: ParticipationSource;
  /** True when participation is the catalog default that nobody has confirmed yet. */
  needsConfirmation: boolean;
  valueOfUse: number;
  maintenance: number;
  electricGross: number;
  familyGapEmployee: number;
  /** Absent when data is missing or the option is not eligible — no net is shown then. */
  breakdown?: NetBreakdown;
  /** Unrounded net(option) − net(today); only when both have a breakdown. */
  diffVsToday?: number;
  /** diffVsToday split per changed component in net terms (compare.ts netDeltaBetween); with diffVsToday only. */
  netDelta?: NetDeltaLine[];
  changes: Change[];
  missing: MissingField[];
}

export interface Comparison {
  today: OptionResult;
  options: OptionResult[];
}

export interface AllowedCars {
  cars: Car[];
  missing: MissingField[];
}
