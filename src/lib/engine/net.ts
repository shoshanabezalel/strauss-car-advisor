import type { Rules } from "@/lib/config/schemas";
import type { NetBreakdown, NetInput } from "./types";

type TwoTier = Rules["netMethod"]["nationalInsurance"];

// Bisection settings for the EV gross-up. Numerical method, not business rules: a fixed iteration count keeps
// the result bit-for-bit deterministic, and 200 halvings of any realistic bracket is far below 1e-9 ILS.
const GROSS_UP_ITERATIONS = 200;
const GROSS_UP_MAX_DOUBLINGS = 64;

/** Progressive tax on `taxable` from rules brackets ([cap, rate], last cap null = open-ended). */
function bracketTax(taxable: number, brackets: Rules["netMethod"]["brackets"]): number {
  let total = 0;
  let lower = 0;
  for (const [cap, rate] of brackets) {
    const upper = cap ?? Infinity;
    if (taxable > lower) total += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return total;
}

/** NI / health: low rate up to the threshold, high rate above it, nothing above the ceiling. */
function twoTier(income: number, t: TwoTier): number {
  const base = Math.min(Math.max(income, 0), t.ceiling);
  return Math.min(base, t.threshold) * t.lowRate + Math.max(0, base - t.threshold) * t.highRate;
}

/** Monthly net for one fully resolved situation (TECH-DESIGN §3). No rounding. */
export function computeNet(input: NetInput, rules: Rules): NetBreakdown {
  const nm = rules.netMethod;
  const cash = input.baseSalary + input.commissions + input.bonus;
  const maintenanceTaxable = rules.waiver.maintenanceIsTaxable ? input.maintenance : 0;
  const pensionBase = cash + (rules.waiver.maintenanceIsPensionable ? input.maintenance : 0);
  const pension = pensionBase * input.pensionPct;
  const studyFund = pensionBase * input.studyFundPct;
  const valueOfUse = nm.participation.reducesValueOfUse
    ? Math.max(0, input.valueOfUse - input.participation)
    : input.valueOfUse;

  const taxable = cash + valueOfUse + maintenanceTaxable + input.electricGross;
  const taxBrackets = bracketTax(taxable, nm.brackets);
  const creditPointsValue = input.creditPoints * nm.creditPointValue;
  const pc = nm.pensionCredit;
  const pensionCredit = pc.rate * Math.min(pension, pc.maxContributionRate * pc.incomeCeiling);
  const tax = Math.max(0, taxBrackets - creditPointsValue - pensionCredit);
  const nationalInsurance = twoTier(taxable, nm.nationalInsurance);
  const health = twoTier(taxable, nm.health);

  const net =
    cash + input.maintenance + input.electricGross -
    tax - nationalInsurance - health - pension - studyFund -
    input.participation - input.familyGapEmployee;

  return { cash, pension, studyFund, taxable, taxBrackets, creditPointsValue, pensionCredit, tax, nationalInsurance, health, net };
}

/**
 * Taxable EV component for `input` (its own electricGross is ignored).
 * gross_up: the G for which net(G) − net(0) = netBonus exactly. flat: netBonus as gross.
 */
export function computeElectricGross(input: NetInput, rules: Rules): number {
  const { netBonus, method } = rules.electric;
  if (method === "flat" || netBonus === 0) return netBonus;

  const base = computeNet({ ...input, electricGross: 0 }, rules).net;
  const gain = (g: number) => computeNet({ ...input, electricGross: g }, rules).net - base;

  let lo = 0;
  let hi = netBonus;
  for (let i = 0; i < GROSS_UP_MAX_DOUBLINGS && gain(hi) < netBonus; i++) hi *= 2;
  for (let i = 0; i < GROSS_UP_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (gain(mid) < netBonus) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
