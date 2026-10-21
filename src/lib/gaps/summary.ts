import { gapLabel } from "./labels";
import { GAP_TYPES, type GapRow, type GapType } from "./types";

const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const TOP = 5;

/**
 * The gaps summary (G add-on), computed in code: counts, topic keys and readable labels, never conversation ids or
 * descriptions. The AI analysis gets it through `analysisInput` (labels only, no keys). `windowDays` is part of it so
 * an insight that names the 7-day window passes the number-guard.
 */
export interface GapSummary {
  windowDays: typeof WINDOW_DAYS;
  /** Gap rows = conversations that hit a gap. */
  total: number;
  byType: Record<GapType, number>;
  /** Up to five (type, topic) by count, ties by the most recent occurrence. `label` is readable (car names, not ids). */
  topTopics: { type: GapType; topic: string; label: string; count: number }[];
  /** First seen in the last 7 days / in the 7 days before that. */
  thisWeek: number;
  lastWeek: number;
}

export function summarizeGaps(rows: readonly GapRow[], now: Date): GapSummary {
  const byType = Object.fromEntries(GAP_TYPES.map((t) => [t, 0])) as Record<GapType, number>;
  const topics = new Map<string, { type: GapType; topic: string; vehicle?: string; count: number; lastSeen: string }>();
  const weekStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  const prevStart = weekStart - WINDOW_DAYS * DAY_MS;
  let thisWeek = 0;
  let lastWeek = 0;

  for (const r of rows) {
    byType[r.type]++;
    const key = `${r.type}|${r.topic}`;
    const t = topics.get(key) ?? { type: r.type, topic: r.topic, vehicle: r.vehicle, count: 0, lastSeen: r.lastSeenAt };
    t.count++;
    if (r.lastSeenAt > t.lastSeen) Object.assign(t, { lastSeen: r.lastSeenAt, vehicle: r.vehicle ?? t.vehicle });
    topics.set(key, t);
    const created = Date.parse(r.createdAt);
    if (created > weekStart && created <= now.getTime()) thisWeek++;
    else if (created > prevStart && created <= weekStart) lastWeek++;
  }

  const topTopics = [...topics.values()]
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, TOP)
    .map(({ type, topic, vehicle, count }) => ({ type, topic, label: gapLabel(type, topic, vehicle), count }));

  return { windowDays: WINDOW_DAYS, total: rows.length, byType, topTopics, thisWeek, lastWeek };
}

/**
 * What the AI analysis receives: the summary with readable labels in place of topic keys, so the model never sees
 * (or repeats) a catalog id like CAR-10.
 */
export function analysisInput(s: GapSummary) {
  return {
    windowDays: s.windowDays,
    total: s.total,
    byType: s.byType,
    topTopics: s.topTopics.map(({ type, label, count }) => ({ type, label, count })),
    thisWeek: s.thisWeek,
    lastWeek: s.lastWeek,
  };
}
