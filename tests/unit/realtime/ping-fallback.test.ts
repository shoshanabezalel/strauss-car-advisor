import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRealtimeEnv } from "@/lib/env";
import { createPingFallback, type PingMode } from "@/lib/realtime/ping-fallback";

const FALLBACK = 5000;
const POLL = 5000;

let pings: number;
let modes: PingMode[];
const make = (enabled = true) =>
  createPingFallback({ enabled, fallbackAfterMs: FALLBACK, pollMs: POLL, onPing: () => pings++, onMode: (m) => modes.push(m) });

beforeEach(() => {
  vi.useFakeTimers();
  pings = 0;
  modes = [];
});
afterEach(() => vi.useRealTimers());

describe("ping fallback", () => {
  it("subscribed in time: one catch-up refetch, then no polling", () => {
    const fb = make();
    expect(fb.mode).toBe("connecting");
    vi.advanceTimersByTime(FALLBACK - 1);
    fb.status("SUBSCRIBED");
    expect(pings).toBe(1);
    vi.advanceTimersByTime(POLL * 10);
    expect(pings).toBe(1);
    expect(fb.mode).toBe("subscribed");
    fb.dispose();
  });

  it("not subscribed within the timeout: polls every interval", () => {
    const fb = make();
    vi.advanceTimersByTime(FALLBACK);
    expect(fb.mode).toBe("polling");
    vi.advanceTimersByTime(POLL * 3);
    expect(pings).toBe(3);
    fb.dispose();
  });

  it("a drop after subscribing starts polling right away", () => {
    for (const drop of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"] as const) {
      pings = 0;
      const fb = make();
      fb.status("SUBSCRIBED");
      pings = 0;
      fb.status(drop);
      expect(fb.mode).toBe("polling");
      vi.advanceTimersByTime(POLL * 2);
      expect(pings).toBe(2);
      fb.dispose();
    }
  });

  it("resubscribing stops polling and refetches once", () => {
    const fb = make();
    vi.advanceTimersByTime(FALLBACK + POLL);
    expect(pings).toBe(1);
    fb.status("SUBSCRIBED");
    expect(pings).toBe(2);
    vi.advanceTimersByTime(POLL * 5);
    expect(pings).toBe(2);
    expect(modes).toEqual(["polling", "subscribed"]);
    fb.dispose();
  });

  it("disabled: never polls, reports offline", () => {
    const fb = make(false);
    vi.advanceTimersByTime(FALLBACK + POLL * 5);
    fb.status("CHANNEL_ERROR");
    vi.advanceTimersByTime(POLL * 5);
    expect(pings).toBe(0);
    expect(fb.mode).toBe("offline");
    fb.dispose();
  });

  it("a broadcast ping is forwarded; dispose stops everything", () => {
    const fb = make();
    fb.ping();
    expect(pings).toBe(1);
    fb.dispose();
    vi.advanceTimersByTime(FALLBACK + POLL * 5);
    expect(pings).toBe(1);
  });
});

describe("realtime env", () => {
  it("defaults to five seconds, enabled", () => {
    expect(parseRealtimeEnv({})).toEqual({ pollEnabled: true, fallbackAfterMs: 5000, pollMs: 5000 });
  });
  it("can be disabled (e2e) and tuned", () => {
    expect(parseRealtimeEnv({ poll: "off", fallbackMs: "2000", pollMs: "1000" })).toEqual({ pollEnabled: false, fallbackAfterMs: 2000, pollMs: 1000 });
  });
});
