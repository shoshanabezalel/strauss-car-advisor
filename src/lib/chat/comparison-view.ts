import type { Config, Drive, ParticipationSource } from "@/lib/config";
import type { ChangeKind, MissingField, Track } from "@/lib/engine";
import type { CompareOutput } from "./store";

/**
 * What the comparison table/cards render. Every amount is copied from `display` (rounded on the server by the
 * compareOptions tool); this module never computes a number.
 */
export interface ComparisonRow {
  key: string;
  isToday: boolean;
  /** Hebrew: "make model" or the waiver label. */
  label: string;
  kind: "car" | "waiver";
  carGroup?: string;
  drive?: Drive;
  track: Track;
  eligible: boolean;
  reason: string;
  needsConfirmation: boolean;
  participationSource?: ParticipationSource;
  missing: MissingField[];
  changes: ChangeKind[];
  amounts: {
    net?: number;
    diffVsToday?: number;
    valueOfUse: number;
    participation: number;
    carCost: number;
    budget?: number;
    electricGross: number;
    maintenance: number;
    familyGapEmployee: number;
  };
  direction?: "up" | "down" | "none";
}

export interface ComparisonView {
  rows: ComparisonRow[];
}

export const WAIVER_LABEL = "ויתור על רכב (אחזקת רכב)";

type Row = CompareOutput["today"] | CompareOutput["options"][number];

function toRow(r: Row, key: string, isToday: boolean, config: Config): ComparisonRow {
  const d = r.display;
  const s = r.situation;
  const car = s.kind === "car" ? (r.car ?? config.catalog.cars.find((c) => c.id === s.carId)) : undefined;
  const label = s.kind === "waiver" ? WAIVER_LABEL : car ? `${car.make} ${car.model}` : s.carId;
  return {
    key,
    isToday,
    label,
    kind: r.situation.kind,
    carGroup: car?.group,
    drive: car?.drive,
    track: r.eligibility.track,
    eligible: r.eligibility.eligible,
    reason: r.eligibility.reason,
    needsConfirmation: r.needsConfirmation,
    participationSource: r.participationSource,
    missing: r.missing,
    changes: [...new Set(r.changes.map((c) => c.kind))],
    amounts: {
      net: d.net,
      diffVsToday: "diffVsToday" in d ? d.diffVsToday : undefined,
      valueOfUse: d.valueOfUse,
      participation: d.participation,
      carCost: d.carCost,
      budget: d.budget,
      electricGross: d.electricGross,
      maintenance: d.maintenance,
      familyGapEmployee: d.familyGapEmployee,
    },
    direction: "direction" in d ? d.direction : undefined,
  };
}

export function toComparisonView(output: CompareOutput, config: Config): ComparisonView {
  return {
    rows: [toRow(output.today, "today", true, config), ...output.options.map((r, i) => toRow(r, `option-${i}`, false, config))],
  };
}
