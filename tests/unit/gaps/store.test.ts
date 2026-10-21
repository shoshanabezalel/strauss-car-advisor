import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { groupGaps } from "@/lib/gaps/group";
import type { GapInput, GapRow } from "@/lib/gaps/types";

// G: one row per (conversation, type, topic); the rep view groups by (type, topic) and counts conversations.
const part: GapInput = { type: "referred_to_rep", topic: "participation/CAR-10", description: "השתתפות לא אושרה", vehicle: "BYD ATTO 3" };
const vehicle: GapInput = { type: "unknown_vehicle", topic: "vehicle/id.7", description: "רכב שאינו בקטלוג", vehicle: "ID.7" };

afterEach(() => vi.useRealTimers());

describe("memory store: information gaps", () => {
  it("a repeat in the same conversation updates last seen, not the count; another conversation counts", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T08:00:00Z") });
    const store = createMemoryStore();
    const a = await store.create("app");
    const b = await store.create("app");
    await store.recordGaps(a, [part, vehicle]);
    vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
    await store.recordGaps(a, [part]);
    await store.recordGaps(b, [part]);

    const groups = await store.listGapGroups();
    expect(groups.find((g) => g.topic === part.topic)).toMatchObject({ type: "referred_to_rep", count: 2, lastSeen: "2026-10-21T09:00:00.000Z", resolved: false, vehicle: "BYD ATTO 3" });
    expect(groups.find((g) => g.topic === vehicle.topic)).toMatchObject({ count: 1, lastSeen: "2026-10-21T08:00:00.000Z" });
  });

  it("טופל holds until the gap shows up again, then the group reopens", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T08:00:00Z") });
    const store = createMemoryStore();
    const a = await store.create("app");
    await store.recordGaps(a, [part]);
    vi.setSystemTime(new Date("2026-10-21T08:30:00Z"));
    await store.setGapResolved(part.type, part.topic, true);
    expect((await store.listGapGroups())[0].resolved).toBe(true);

    vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
    await store.recordGaps(await store.create("app"), [part]);
    expect((await store.listGapGroups())[0]).toMatchObject({ resolved: false, count: 2 });

    await store.setGapResolved(part.type, part.topic, true);
    await store.setGapResolved(part.type, part.topic, false);
    expect((await store.listGapGroups())[0].resolved).toBe(false);
  });

  it("gapLog(conversation) records one agent gap for that conversation", async () => {
    const store = createMemoryStore();
    const a = await store.create("app");
    await store.gapLog(a).log({ type: "no_data", topic: "rules", description: "כיסוי ביטוחי בחופשת לידה" });
    expect(await store.listGapGroups()).toEqual([expect.objectContaining({ type: "no_data", topic: "rules", count: 1 })]);
  });
});

describe("groupGaps", () => {
  const row = (conversationId: string, over: Partial<GapRow> = {}): GapRow => ({
    conversationId,
    type: "referred_to_rep",
    topic: "participation/CAR-10",
    description: "d",
    createdAt: "2026-10-20T10:00:00.000Z",
    lastSeenAt: "2026-10-20T10:00:00.000Z",
    ...over,
  });

  it("open groups first, then by count, then by last seen", () => {
    const groups = groupGaps(
      [
        row("a"),
        row("b"),
        row("c", { type: "unknown_vehicle", topic: "vehicle/x", lastSeenAt: "2026-10-21T10:00:00.000Z" }),
        row("d", { type: "no_data", topic: "tax" }),
        row("e", { type: "no_data", topic: "rules" }),
        row("f", { type: "no_data", topic: "rules" }),
        row("g", { type: "no_data", topic: "rules" }),
      ],
      [{ type: "no_data", topic: "rules", resolvedAt: "2026-10-21T00:00:00.000Z" }],
    );
    expect(groups.map((g) => `${g.topic}:${g.count}:${g.resolved}`)).toEqual([
      "participation/CAR-10:2:false",
      "vehicle/x:1:false",
      "tax:1:false",
      "rules:3:true",
    ]);
  });
});
