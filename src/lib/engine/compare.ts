import type { Situation } from "@/lib/config/schemas";
import { checkEligibility, findCar, findOccupation, resolveGroup } from "./eligibility";
import { computeElectricGross, computeNet } from "./net";
import type { Change, Comparison, EmployeeProfile, EngineConfig, MissingField, NetInput, OptionResult } from "./types";

const SALARY_FIELDS = ["baseSalary", "commissions", "bonus", "pensionPct", "studyFundPct", "creditPoints"] as const;

/**
 * Resolve one situation and compute its net. `gate` = only compute when eligible
 * (off for "today": the employee's current situation is a fact, not a request).
 */
function evaluate(profile: EmployeeProfile, situation: Situation, config: EngineConfig, gate: boolean): OptionResult {
  const { rules } = config;
  const eligibility = checkEligibility(profile, situation, config);
  const missing: MissingField[] = [...eligibility.missing];
  for (const f of SALARY_FIELDS) if (profile[f] === undefined && !missing.includes(f)) missing.push(f);

  const group = resolveGroup(profile, config);
  const budget = group !== undefined ? rules.budgets[group] : undefined;
  const result: OptionResult = {
    situation,
    eligibility,
    budget,
    carCost: 0,
    participation: 0,
    needsConfirmation: false,
    valueOfUse: 0,
    maintenance: 0,
    electricGross: 0,
    familyGapEmployee: 0,
    changes: [],
    missing,
  };

  if (situation.kind === "waiver") {
    result.maintenance = findOccupation(profile, config)?.maintenance ?? 0;
  } else {
    const car = findCar(situation.carId, config);
    if (car) {
      result.car = car;
      result.carCost = car.monthlyCost;
      result.valueOfUse = car.valueOfUse;
      if (situation.participation !== undefined) {
        result.participation = situation.participation;
        result.participationSource = situation.participationSource;
      } else {
        result.participation = car.defaultParticipation;
        result.participationSource = "catalog_default";
      }
      result.needsConfirmation = result.participationSource === "catalog_default";
      if (eligibility.track === "family" && budget !== undefined) {
        result.familyGapEmployee = Math.max(0, car.monthlyCost - budget) * rules.familyTrack.gapSplitEmployee;
      }
    }
  }

  if (missing.length || (gate && !eligibility.eligible)) return result;

  const input: NetInput = {
    baseSalary: profile.baseSalary!,
    commissions: profile.commissions!,
    bonus: profile.bonus!,
    pensionPct: profile.pensionPct!,
    studyFundPct: profile.studyFundPct!,
    creditPoints: profile.creditPoints!,
    valueOfUse: result.valueOfUse,
    maintenance: result.maintenance,
    electricGross: 0,
    participation: result.participation,
    familyGapEmployee: result.familyGapEmployee,
  };
  if (result.car?.drive === "electric") input.electricGross = result.electricGross = computeElectricGross(input, rules);
  result.breakdown = computeNet(input, rules);
  return result;
}

/** Evaluate a requested situation; no net unless eligible and complete. */
export function evaluateSituation(profile: EmployeeProfile, situation: Situation, config: EngineConfig): OptionResult {
  return evaluate(profile, situation, config, true);
}

function changesBetween(today: OptionResult, option: OptionResult): Change[] {
  const pairs: [Change["kind"], number, number][] = [
    ["valueOfUse", today.valueOfUse, option.valueOfUse],
    ["maintenance", today.maintenance, option.maintenance],
    ["participation", today.participation, option.participation],
    ["electric", today.electricGross, option.electricGross],
    ["familyGap", today.familyGapEmployee, option.familyGapEmployee],
  ];
  return pairs.filter(([, from, to]) => from !== to).map(([kind, from, to]) => ({ kind, from, to }));
}

/** Today vs. each requested option, with unrounded diffs and structured changes for the explanation. */
export function compareOptions(profile: EmployeeProfile, options: Situation[], config: EngineConfig): Comparison {
  const today: OptionResult = profile.current
    ? evaluate(profile, profile.current, config, false)
    : {
        situation: { kind: "waiver" },
        eligibility: { eligible: false, track: "regular", reason: "חסר המצב הנוכחי", missing: ["current"] },
        carCost: 0,
        participation: 0,
        needsConfirmation: false,
        valueOfUse: 0,
        maintenance: 0,
        electricGross: 0,
        familyGapEmployee: 0,
        changes: [],
        missing: ["current"],
      };

  return {
    today,
    options: options.map((s) => {
      const r = evaluate(profile, s, config, true);
      if (today.missing.length === 0) r.changes = changesBetween(today, r);
      if (today.breakdown && r.breakdown) r.diffVsToday = r.breakdown.net - today.breakdown.net;
      return r;
    }),
  };
}
