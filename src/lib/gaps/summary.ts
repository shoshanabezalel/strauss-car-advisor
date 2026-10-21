import { GAP_TYPES, type GapRow, type GapType } from "./types";

const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const TOP = 5;

/**
 * The gaps summary (G add-on), computed in code. It is also the AI analysis's only input, so it holds counts and
 * topic keys, never conversation ids or descriptions. `windowDays` is part of it so an insight that names the
 * 7-day window passes the number-guard.
 */
export interface GapSummary {
  windowDays: typeof WINDOW_DAYS;
  /** Gap rows = conversations that hit a gap. */
  total: number;
  byType: Record<GapType, number>;
  /** Up to five (type, topic) by count, ties by the most recent occurrence. */
  topTopics: { type: GapType; topic: string; count: number }[];
  /** First seen in the last 7 days / in the 7 days before that. */
  thisWeek: number;
  lastWeek: number;
}

export function summarizeGaps(rows: readonly GapRow[], now: Date): GapSummary {
  const byType = Object.fromEntries(GAP_TYPES.map((t) => [t, 0])) as Record<GapType, number>;
  const topics = new Map<string, { type: GapType; topic: string; count: number; lastSeen: string }>();
  const weekStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  const prevStart = weekStart - WINDOW_DAYS * DAY_MS;
  let thisWeek = 0;
  let lastWeek = 0;

  for (const r of rows) {
    byType[r.type]++;
    const key = `${r.type}|${r.topic}`;
    const t = topics.get(key) ?? { type: r.type, topic: r.topic, count: 0, lastSeen: r.lastSeenAt };
    t.count++;
    if (r.lastSeenAt > t.lastSeen) t.lastSeen = r.lastSeenAt;
    topics.set(key, t);
    const created = Date.parse(r.createdAt);
    if (created > weekStart && created <= now.getTime()) thisWeek++;
    else if (created > prevStart && created <= weekStart) lastWeek++;
  }

  const topTopics = [...topics.values()]
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, TOP)
    .map(({ type, topic, count }) => ({ type, topic, count }));

  return { windowDays: WINDOW_DAYS, total: rows.length, byType, topTopics, thisWeek, lastWeek };
}
