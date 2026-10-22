import type { Drive, Situation } from "@/lib/config/schemas";
import { compareOptions, missingProfileFields } from "./compare";
import type { EmployeeProfile, EngineConfig, MissingField, OptionResult } from "./types";

/** What the employee asked for (F8). Every field optional; amounts in shekels per month. */
export interface Constraints {
  /** Allowed drive types; absent or empty = any. */
  drives?: Drive[];
  /** The net may go down by at most this much vs today. */
  maxNetDrop?: number;
  /** The net must go up by at least this much vs today. */
  minNetGain?: number;
  /** The car's participation may be at most this much. */
  maxParticipation?: number;
}

export type MissKind = "netDrop" | "netGain" | "participation";

/** A constraint the option breaks, and by how much (unrounded, > 0). */
export interface Miss {
  kind: MissKind;
  by: number;
}

export interface FoundOption {
  option: OptionResult;
  misses: Miss[];
}

export interface FindResult {
  /** Profile fields still needed; when not empty nothing else is computed. */
  missing: MissingField[];
  today?: OptionResult;
  /** Options that meet every constraint, best net change first, at most rules.search.maxMatches. */
  matches: FoundOption[];
  /** Only when there are no matches: the closest options (smallest total miss), at most rules.search.nearestCount. */
  nearest: FoundOption[];
  /** Cars of the requested drive types that the employee may not take, with the eligibility reason. */
  notEligible: OptionResult[];
}

/** The constraints this option breaks. Exact, unrounded comparisons. */
function missesOf(o: OptionResult, c: Constraints): Miss[] {
  const misses: Miss[] = [];
  const diff = o.diffVsToday!;
  if (c.maxNetDrop !== undefined && diff < -c.maxNetDrop) misses.push({ kind: "netDrop", by: -c.maxNetDrop - diff });
  if (c.minNetGain !== undefined && diff < c.minNetGain) misses.push({ kind: "netGain", by: c.minNetGain - diff });
  if (c.maxParticipation !== undefined && o.participation > c.maxParticipation) {
    misses.push({ kind: "participation", by: o.participation - c.maxParticipation });
  }
  return misses;
}

const totalMiss = (f: FoundOption) => f.misses.reduce((s, m) => s + m.by, 0);

/**
 * F8: every catalog car of the requested drive types (except today's car), evaluated by compareOptions, so
 * eligibility and the net come from the existing rules. `repParticipation` = participation the representative
 * confirmed per car; other cars take the catalog default (needsConfirmation stays set).
 */
export function findOptions(
  profile: EmployeeProfile,
  constraints: Constraints,
  config: EngineConfig,
  repParticipation: Record<string, number> = {},
): FindResult {
  const missing = missingProfileFields(profile, config);
  if (missing.length) return { missing, matches: [], nearest: [], notEligible: [] };

  const { maxMatches, nearestCount } = config.rules.search;
  const drives = constraints.drives?.length ? constraints.drives : undefined;
  const currentId = profile.current?.kind === "car" ? profile.current.carId : undefined;
  const situations: Situation[] = config.catalog.cars
    .filter((car) => car.id !== currentId && (!drives || drives.includes(car.drive)))
    .map((car) =>
      repParticipation[car.id] === undefined
        ? { kind: "car", carId: car.id }
        : { kind: "car", carId: car.id, participation: repParticipation[car.id], participationSource: "rep" },
    );

  const { today, options } = compareOptions(profile, situations, config);
  const notEligible = options.filter((o) => !o.eligibility.eligible);
  const found = options
    .filter((o) => o.eligibility.eligible && o.diffVsToday !== undefined)
    .map((option) => ({ option, misses: missesOf(option, constraints) }));
  const byNet = (a: FoundOption, b: FoundOption) => b.option.diffVsToday! - a.option.diffVsToday!;

  const matches = found.filter((f) => f.misses.length === 0).sort(byNet).slice(0, maxMatches);
  const nearest = matches.length
    ? []
    : found
        .sort((a, b) => totalMiss(a) - totalMiss(b) || byNet(a, b))
        .slice(0, nearestCount);
  return { missing: [], today, matches, nearest, notEligible };
}
