import type { AgentState, ProfileField, ProfileSource } from "@/lib/agent";
import type { Config, Situation } from "@/lib/config";
import { allowedCars, checkEligibility, missingProfileFields, type MissingField } from "@/lib/engine";

/**
 * The profile form of the employee screen (M6, F5). Values are what the employee said: percents ×100, the same
 * as-said form updateProfile accepts. That is unit formatting, not a calculation; it happens here, on the server.
 */
export interface ProfileView {
  values: {
    occupation?: string;
    group?: string;
    baseSalary?: number;
    commissions?: number;
    bonus?: number;
    pensionPct?: number;
    studyFundPct?: number;
    creditPoints?: number;
    childrenUnder23?: number;
    current?: Situation;
  };
  sources: Partial<Record<ProfileField, ProfileSource>>;
  /** Confirmed by the representative: read-only in the form, rejected by POST /api/profile. */
  locked: ProfileField[];
  missing: MissingField[];
  choices: {
    /** Cars the employee may pick (own group and lower, family track when eligible). Empty until the group is known. */
    allowedCars: { id: string; label: string; group: string; drive: string }[];
    /** Every catalog car, for "my car today". */
    allCars: { id: string; label: string; group: string }[];
    /** undefined until the occupation is known. */
    waiverAllowed?: boolean;
    groups: string[];
    occupations: string[];
  };
}

const asSaid = (f: number | undefined) => (f === undefined ? undefined : +(f * 100).toFixed(4));

/** Fields the representative confirmed: the employee can't overwrite them from the form. */
export function lockedFields(state: AgentState): ProfileField[] {
  const locked = (Object.entries(state.sources) as [ProfileField, ProfileSource][]).filter(([, s]) => s === "rep").map(([f]) => f);
  const current = state.profile.current;
  if (current?.kind === "car" && current.participationSource === "rep" && !locked.includes("current")) locked.push("current");
  return locked;
}

export function toProfileView(state: AgentState, config: Config): ProfileView {
  const p = state.profile;
  const label = (c: { make: string; model: string }) => `${c.make} ${c.model}`;
  const waiver = p.occupation ? checkEligibility(p, { kind: "waiver" }, config) : undefined;
  return {
    values: {
      occupation: p.occupation,
      group: p.group,
      baseSalary: p.baseSalary,
      commissions: p.commissions,
      bonus: p.bonus,
      pensionPct: asSaid(p.pensionPct),
      studyFundPct: asSaid(p.studyFundPct),
      creditPoints: p.creditPoints,
      childrenUnder23: p.childrenUnder23,
      current: p.current,
    },
    sources: { ...state.sources },
    locked: lockedFields(state),
    missing: missingProfileFields(p, config),
    choices: {
      allowedCars: allowedCars(p, config).cars.map((c) => ({ id: c.id, label: label(c), group: c.group, drive: c.drive })),
      allCars: config.catalog.cars.map((c) => ({ id: c.id, label: label(c), group: c.group })),
      waiverAllowed: waiver?.eligible,
      groups: [...config.rules.groupOrder],
      occupations: config.occupations.occupations.map((o) => o.name),
    },
  };
}
