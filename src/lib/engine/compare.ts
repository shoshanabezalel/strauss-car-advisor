import type { Situation } from "@/lib/config/schemas";
import { checkEligibility, findCar, findOccupation, resolveGroup } from "./eligibility";
import { computeElectricGross, computeNet } from "./net";
import type { Change, ChangeKind, Comparison, EmployeeProfile, EngineConfig, MissingField, NetDeltaLine, NetInput, OptionResult } from "./types";

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

  const input = netInputOf(profile, result);
  if (result.car?.drive === "electric") input.electricGross = result.electricGross = computeElectricGross(input, rules);
  result.breakdown = computeNet(input, rules);
  return result;
}

/** The engine input of a resolved situation (salary fields from the profile, the rest from the result). */
function netInputOf(profile: EmployeeProfile, r: OptionResult): NetInput {
  return {
    baseSalary: profile.baseSalary!,
    commissions: profile.commissions!,
    bonus: profile.bonus!,
    pensionPct: profile.pensionPct!,
    studyFundPct: profile.studyFundPct!,
    creditPoints: profile.creditPoints!,
    valueOfUse: r.valueOfUse,
    maintenance: r.maintenance,
    electricGross: r.electricGross,
    participation: r.participation,
    familyGapEmployee: r.familyGapEmployee,
  };
}

/**
 * The order components are switched from today's value to the option's (user decision 21/10). Each line is the net
 * change of its own step, so tax interactions go to the earlier step: participation shows its own amount (a net
 * deduction), value-of-use the tax / NI / health at today's income, the allowance after tax, the EV refund last so
 * it is exactly the rules' net bonus.
 */
const NET_DELTA_STEPS: { kind: ChangeKind; field: keyof NetInput & keyof OptionResult }[] = [
  { kind: "participation", field: "participation" },
  { kind: "valueOfUse", field: "valueOfUse" },
  { kind: "maintenance", field: "maintenance" },
  { kind: "familyGap", field: "familyGapEmployee" },
  { kind: "electric", field: "electricGross" },
];

/**
 * diffVsToday split per component in net terms: start from today's input and switch one component at a time to
 * the option's value, recomputing the net. Unchanged components get no line. The last line takes the rest of
 * diffVsToday, so the lines sum to it exactly (floating point included). No rounding.
 */
function netDeltaBetween(profile: EmployeeProfile, today: OptionResult, option: OptionResult, diff: number, rules: EngineConfig["rules"]): NetDeltaLine[] {
  let input = netInputOf(profile, today);
  let net = computeNet(input, rules).net;
  const lines: NetDeltaLine[] = [];
  for (const { kind, field } of NET_DELTA_STEPS) {
    if (today[field] === option[field]) continue;
    input = { ...input, [field]: option[field] };
    const next = computeNet(input, rules).net;
    lines.push({ kind, amount: next - net });
    net = next;
  }
  if (lines.length) {
    const last = lines[lines.length - 1];
    last.amount = diff - lines.slice(0, -1).reduce((s, l) => s + l.amount, 0);
  }
  return lines;
}

/**
 * Profile fields still needed before a comparison can be complete (F2): group (or an occupation that implies it),
 * the salary fields, children under 23 and the current situation. Order follows EmployeeProfile.
 */
export function missingProfileFields(profile: EmployeeProfile, config: EngineConfig): MissingField[] {
  const missing: MissingField[] = [];
  if (resolveGroup(profile, config) === undefined) missing.push("group");
  for (const f of SALARY_FIELDS) if (profile[f] === undefined) missing.push(f);
  if (profile.childrenUnder23 === undefined) missing.push("childrenUnder23");
  if (profile.current === undefined) missing.push("current");
  return missing;
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
      if (today.breakdown && r.breakdown) {
        r.diffVsToday = r.breakdown.net - today.breakdown.net;
        r.netDelta = netDeltaBetween(profile, today, r, r.diffVsToday, config.rules);
      }
      return r;
    }),
  };
}
