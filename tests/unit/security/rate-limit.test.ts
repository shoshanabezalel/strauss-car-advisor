import { describe, expect, it, vi } from "vitest";
import {
  clientIp,
  createMemoryRateLimiter,
  createSupabaseRateLimiter,
  enforceLimits,
  LIMITS,
  RATE_LIMIT_MESSAGE,
  rateLimitScale,
  type RateLimit,
} from "@/lib/security/rate-limit";

// M7: rate limits on every API route (fixed window, Postgres in the app, memory here).
const perMinute = (max: number): RateLimit => ({ name: "t", windowSec: 60, max });

describe("memory rate limiter (same contract as the Postgres function)", () => {
  it("allows max hits per window, then denies with the seconds left; a new window resets", async () => {
    let now = 120_000; // window boundary
    const rl = createMemoryRateLimiter(() => now);
    for (let i = 0; i < 3; i++) expect((await rl.hit("k", 60, 3)).allowed).toBe(true);
    now += 15_000;
    expect(await rl.hit("k", 60, 3)).toEqual({ allowed: false, retryAfterSec: 45 });
    now += 45_000;
    expect((await rl.hit("k", 60, 3)).allowed).toBe(true);
  });

  it("keys are independent", async () => {
    const rl = createMemoryRateLimiter(() => 0);
    expect((await rl.hit("a", 60, 1)).allowed).toBe(true);
    expect((await rl.hit("a", 60, 1)).allowed).toBe(false);
    expect((await rl.hit("b", 60, 1)).allowed).toBe(true);
  });
});

describe("Supabase rate limiter", () => {
  it("maps the RPC row", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ allowed: false, retry_after: 12 }], error: null });
    const rl = createSupabaseRateLimiter({ rpc } as never);
    expect(await rl.hit("chat:ip:1.2.3.4", 60, 60)).toEqual({ allowed: false, retryAfterSec: 12 });
    expect(rpc).toHaveBeenCalledWith("hit_rate_limit", { p_key: "chat:ip:1.2.3.4", p_window_seconds: 60, p_max: 60 });
  });

  it("fails open (logged) when the RPC errors or throws, so a DB hiccup doesn't take the demo down", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const erroring = createSupabaseRateLimiter({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) } as never);
    expect((await erroring.hit("k", 60, 1)).allowed).toBe(true);
    const throwing = createSupabaseRateLimiter({ rpc: vi.fn().mockRejectedValue(new Error("network")) } as never);
    expect((await throwing.hit("k", 60, 1)).allowed).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("enforceLimits", () => {
  it("null while under every limit", async () => {
    const rl = createMemoryRateLimiter(() => 0);
    expect(await enforceLimits(rl, [{ limit: perMinute(2), key: "ip" }])).toBeNull();
  });

  it("over a limit → 429 with Retry-After and a Hebrew message without digits", async () => {
    const rl = createMemoryRateLimiter(() => 0);
    const checks = [{ limit: perMinute(1), key: "ip" }];
    await enforceLimits(rl, checks);
    const res = (await enforceLimits(rl, checks))!;
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    const body = await res.json();
    expect(body).toEqual({ error: "rate_limited", message: RATE_LIMIT_MESSAGE });
    expect(RATE_LIMIT_MESSAGE).toMatch(/[א-ת]/);
    expect(RATE_LIMIT_MESSAGE).not.toMatch(/\d/);
  });

  it("checks every bucket in one go; any bucket over its limit → 429 with the longest wait", async () => {
    let now = 0;
    const rl = createMemoryRateLimiter(() => now);
    const hit = vi.spyOn(rl, "hit");
    const minute = { limit: { ...perMinute(1), name: "a" }, key: "x" };
    const hour = { limit: { name: "b", windowSec: 3600, max: 1 }, key: "x" };
    expect(await enforceLimits(rl, [minute, hour])).toBeNull();
    now = 10_000;
    const res = (await enforceLimits(rl, [minute, hour]))!;
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3590");
    expect(hit).toHaveBeenCalledTimes(4);
  });

  it("bucket keys carry the limit name, so routes don't share a bucket", async () => {
    const rl = createMemoryRateLimiter(() => 0);
    const hit = vi.spyOn(rl, "hit");
    await enforceLimits(rl, [{ limit: LIMITS.chatIpMinute, key: "1.2.3.4" }]);
    expect(hit).toHaveBeenCalledWith(`${LIMITS.chatIpMinute.name}:1.2.3.4`, 60, LIMITS.chatIpMinute.max);
  });

  it("scale multiplies every max (the e2e server shares one IP)", async () => {
    const rl = createMemoryRateLimiter(() => 0);
    const hit = vi.spyOn(rl, "hit");
    await enforceLimits(rl, [{ limit: perMinute(5), key: "ip" }], 20);
    expect(hit).toHaveBeenCalledWith("t:ip", 60, 100);
  });
});

describe("limits table (TECH-DESIGN §10: venue Wi-Fi shares one IP, so per-IP is loose)", () => {
  it("chat: 60/min and 600/h per IP, 30/h per conversation, 300/day globally", () => {
    expect(LIMITS.chatIpMinute).toMatchObject({ windowSec: 60, max: 60 });
    expect(LIMITS.chatIpHour).toMatchObject({ windowSec: 3600, max: 600 });
    expect(LIMITS.chatConversation).toMatchObject({ windowSec: 3600, max: 30 });
    expect(LIMITS.chatGlobalDay).toMatchObject({ windowSec: 86_400, max: 300 });
  });

  it("other routes ×6; rep login stays 5 per 15 min", () => {
    expect(LIMITS.directIp).toMatchObject({ windowSec: 60, max: 180 });
    expect(LIMITS.conversationIp).toMatchObject({ windowSec: 60, max: 720 });
    expect(LIMITS.repQuestionsIp).toMatchObject({ windowSec: 60, max: 360 });
    expect(LIMITS.repAnswerIp).toMatchObject({ windowSec: 60, max: 180 });
    expect(LIMITS.repLoginIp).toMatchObject({ windowSec: 900, max: 5 });
  });

  it("names are unique", () => {
    const names = Object.values(LIMITS).map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("clientIp and scale", () => {
  it("first x-forwarded-for hop, then x-real-ip, else 'local'", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "8.8.8.8" } }))).toBe("8.8.8.8");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });

  it("RATE_LIMIT_SCALE: default 1, positive numbers only", () => {
    expect(rateLimitScale(undefined)).toBe(1);
    expect(rateLimitScale("")).toBe(1);
    expect(rateLimitScale("20")).toBe(20);
    expect(rateLimitScale("0")).toBe(1);
    expect(rateLimitScale("abc")).toBe(1);
  });
});
