import type { GapGroup, GapRow, GapStatus } from "./types";

/**
 * The rep view (pure): one group per (type, topic). count = conversations (rows are already one per conversation),
 * lastSeen = the latest occurrence, description and vehicle from it. טופל holds only while no occurrence is newer
 * than the resolution. Open groups first, then by count, then by last seen.
 */
export function groupGaps(rows: readonly GapRow[], statuses: readonly GapStatus[]): GapGroup[] {
  const groups = new Map<string, GapGroup>();
  for (const r of rows) {
    const key = `${r.type}|${r.topic}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { type: r.type, topic: r.topic, description: r.description, vehicle: r.vehicle, count: 1, lastSeen: r.lastSeenAt, resolved: false });
      continue;
    }
    g.count++;
    if (r.lastSeenAt > g.lastSeen) Object.assign(g, { lastSeen: r.lastSeenAt, description: r.description, vehicle: r.vehicle ?? g.vehicle });
  }
  for (const s of statuses) {
    const g = groups.get(`${s.type}|${s.topic}`);
    if (g) g.resolved = s.resolvedAt >= g.lastSeen;
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.resolved) - Number(b.resolved) || b.count - a.count || b.lastSeen.localeCompare(a.lastSeen),
  );
}
