import { describe, expect, it } from "vitest";
import { summarizeGaps } from "@/lib/gaps/summary";
import type { GapRow } from "@/lib/gaps/types";

// G add-on: the summary is computed in code (the AI analysis only reads it). Counts are rows = conversations.
const NOW = new Date("2026-10-21T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let n = 0;
const row = (type: GapRow["type"], topic: string, createdDaysAgo: number, lastSeenDaysAgo = createdDaysAgo): GapRow => ({
  conversationId: `conv-${++n}`,
  type,
  topic,
  description: "d",
  createdAt: daysAgo(createdDaysAgo),
  lastSeenAt: daysAgo(lastSeenDaysAgo),
});

const fixture: GapRow[] = [
  row("referred_to_rep", "participation/CAR-10", 1),
  row("referred_to_rep", "participation/CAR-10", 2),
  row("referred_to_rep", "participation/CAR-10", 9),
  row("referred_to_rep", "current", 3),
  row("unknown_vehicle", "vehicle/id.7", 6.99), // just inside this week
  row("unknown_vehicle", "vehicle/id.7", 7.01), // just inside last week
  row("unknown_vehicle", "vehicle/tesla model y", 13),
  row("no_data", "rules", 0.5),
  row("no_data", "rules", 4),
  row("no_data", "tax", 20), // older than two weeks: in totals, in neither week
  row("no_data", "electric", 5, 1), // ties with tax/current on count 1; seen more recently
];

describe("summarizeGaps", () => {
  const s = summarizeGaps(fixture, NOW);

  it("carries the window, the total and per-type totals", () => {
    expect(s.windowDays).toBe(7);
    expect(s.total).toBe(11);
    expect(s.byType).toEqual({ no_data: 4, referred_to_rep: 4, unknown_vehicle: 3 });
  });

  it("top 5 topics by count; ties broken by the most recent occurrence", () => {
    expect(s.topTopics).toEqual([
      { type: "referred_to_rep", topic: "participation/CAR-10", count: 3 },
      { type: "no_data", topic: "rules", count: 2 }, // last seen 0.5 days ago
      { type: "unknown_vehicle", topic: "vehicle/id.7", count: 2 }, // last seen 6.99 days ago
      { type: "no_data", topic: "electric", count: 1 },
      { type: "referred_to_rep", topic: "current", count: 1 },
    ]);
  });

  it("this week vs last week, by first occurrence, exact at the 7-day boundary", () => {
    expect(s.thisWeek).toBe(7); // first seen 1, 2, 3, 6.99, 0.5, 4 and 5 days ago
    expect(s.lastWeek).toBe(3); // 9, 7.01, 13
  });

  it("no rows → zeros, no topics", () => {
    expect(summarizeGaps([], NOW)).toEqual({ windowDays: 7, total: 0, byType: { no_data: 0, referred_to_rep: 0, unknown_vehicle: 0 }, topTopics: [], thisWeek: 0, lastWeek: 0 });
  });

  it("holds no conversation ids or descriptions (it is what the AI analysis receives)", () => {
    const json = JSON.stringify(s);
    expect(json).not.toContain("conv-");
    expect(json).not.toContain("description");
  });
});
