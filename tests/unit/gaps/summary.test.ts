import { describe, expect, it } from "vitest";
import { analysisInput, summarizeGaps } from "@/lib/gaps/summary";
import type { GapRow } from "@/lib/gaps/types";

// G add-on: the summary is computed in code (the AI analysis only reads it). Counts are rows = conversations.
const NOW = new Date("2026-10-21T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let n = 0;
const row = (type: GapRow["type"], topic: string, createdDaysAgo: number, lastSeenDaysAgo = createdDaysAgo, vehicle?: string): GapRow => ({
  conversationId: `conv-${++n}`,
  type,
  topic,
  description: "d",
  ...(vehicle ? { vehicle } : {}),
  createdAt: daysAgo(createdDaysAgo),
  lastSeenAt: daysAgo(lastSeenDaysAgo),
});

const fixture: GapRow[] = [
  row("referred_to_rep", "participation/CAR-10", 1, 1, "BYD ATTO 3"),
  row("referred_to_rep", "participation/CAR-10", 2, 2, "BYD ATTO 3"),
  row("referred_to_rep", "participation/CAR-10", 9, 9, "BYD ATTO 3"),
  row("referred_to_rep", "current", 3),
  row("unknown_vehicle", "vehicle/id.7", 6.99, 6.99, "פולקסווגן ID.7"), // just inside this week
  row("unknown_vehicle", "vehicle/id.7", 7.01, 7.01, "פולקסווגן ID.7"), // just inside last week
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
    expect(s.byType).toEqual({ no_data: 4, referred_to_rep: 4, pending_confirmation: 0, unknown_vehicle: 3 });
  });

  it("top 5 topics by count; ties broken by the most recent occurrence", () => {
    expect(s.topTopics).toEqual([
      { type: "referred_to_rep", topic: "participation/CAR-10", label: "השתתפות עצמית: BYD ATTO 3", count: 3 },
      { type: "no_data", topic: "rules", label: "כללי החברה", count: 2 }, // last seen 0.5 days ago
      { type: "unknown_vehicle", topic: "vehicle/id.7", label: "רכב שאינו בקטלוג: פולקסווגן ID.7", count: 2 }, // last seen 6.99 days ago
      { type: "no_data", topic: "electric", label: "רכב חשמלי", count: 1 },
      { type: "referred_to_rep", topic: "current", label: "הרכב הנוכחי", count: 1 },
    ]);
  });

  it("the AI's input has readable labels only: no topic keys, no catalog ids", () => {
    const input = analysisInput(s);
    const json = JSON.stringify(input);
    expect(json).not.toMatch(/CAR-\d+/);
    expect(json).not.toContain("participation/");
    expect(json).not.toContain('"topic"');
    expect(input.topTopics[0]).toEqual({ type: "referred_to_rep", label: "השתתפות עצמית: BYD ATTO 3", count: 3 });
    expect(input).toMatchObject({ windowDays: 7, total: 11, thisWeek: 7, lastWeek: 3 });
  });

  it("this week vs last week, by first occurrence, exact at the 7-day boundary", () => {
    expect(s.thisWeek).toBe(7); // first seen 1, 2, 3, 6.99, 0.5, 4 and 5 days ago
    expect(s.lastWeek).toBe(3); // 9, 7.01, 13
  });

  it("no rows → zeros, no topics", () => {
    expect(summarizeGaps([], NOW)).toEqual({ windowDays: 7, total: 0, byType: { no_data: 0, referred_to_rep: 0, pending_confirmation: 0, unknown_vehicle: 0 }, topTopics: [], thisWeek: 0, lastWeek: 0 });
  });

  it("holds no conversation ids or descriptions", () => {
    const json = JSON.stringify(s);
    expect(json).not.toContain("conv-");
    expect(json).not.toContain("description");
  });
});
