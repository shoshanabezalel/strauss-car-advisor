import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate limits on every API route (M7, TECH-DESIGN §10). Fixed windows counted in Postgres (`hit_rate_limit`,
 * migration 0004), so they hold across serverless instances without a new service.
 *
 * Judges at the venue share one Wi-Fi IP, so the per-IP limits are loose; the real protection against LLM cost is
 * per conversation and the global daily cap. Ops settings, not business rules, so they live here and not in data/.
 */
export interface RateLimit {
  /** Bucket prefix: routes never share a bucket. */
  name: string;
  windowSec: number;
  max: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMITS = {
  chatIpMinute: { name: "chat:ip:m", windowSec: MINUTE, max: 60 },
  chatIpHour: { name: "chat:ip:h", windowSec: HOUR, max: 600 },
  chatConversation: { name: "chat:conv", windowSec: HOUR, max: 30 },
  /**
   * LLM calls per day per environment (llmBudgetKey): chat turns (up to two generations each) and payslip reads.
   * 1,000 for judging day (user, 21/10); the prepaid Google credit is the hard money cap.
   */
  chatGlobalDay: { name: "chat:all", windowSec: DAY, max: 1000 },
  /** /api/profile and /api/compare: no LLM, but they write state. */
  directIp: { name: "direct:ip", windowSec: MINUTE, max: 180 },
  /** One open tab polls at most every 5 s when Realtime is down. */
  conversationIp: { name: "conv:ip", windowSec: MINUTE, max: 720 },
  repQuestionsIp: { name: "repq:ip", windowSec: MINUTE, max: 360 },
  repAnswerIp: { name: "repa:ip", windowSec: MINUTE, max: 180 },
  /** The rep screen's information gaps tab (G): list and טופל. */
  repGapsIp: { name: "repgaps:ip", windowSec: MINUTE, max: 360 },
  /** "ניתוח AI" on the gaps tab: an LLM call per hit. */
  gapAnalysisIp: { name: "gapai:ip", windowSec: 10 * MINUTE, max: 10 },
  /** Payslip upload (F6): a vision LLM call per hit; it also counts in chatGlobalDay. The venue shares one IP. */
  payslipIp: { name: "payslip:ip", windowSec: MINUTE, max: 30 },
  /** Brute-force guard on the shared code: not loosened for the venue. */
  repLoginIp: { name: "replogin:ip", windowSec: 15 * MINUTE, max: 5 },
  /** The live fallback check makes a real LLM call per hit; only the deployed suite needs it. */
  fallbackCheckIp: { name: "fbcheck:ip", windowSec: 10 * MINUTE, max: 5 },
} satisfies Record<string, RateLimit>;

/** Digit-free, like every fixed Hebrew message. */
export const RATE_LIMIT_MESSAGE = "יותר מדי בקשות כרגע. אפשר לנסות שוב בעוד כמה דקות.";

/**
 * The bucket of the daily LLM cap. Local dev, local and CI e2e and production share one Supabase, so one shared
 * counter let test traffic use up production's budget (21/10). Production on Vercel with real conversations gets
 * its own; every other environment counts apart, still capped.
 */
export function llmBudgetKey({ vercelEnv, source }: { vercelEnv: string | undefined; source: "app" | "e2e" }): string {
  return vercelEnv === "production" && source === "app" ? "production" : `${source}:${vercelEnv ?? "local"}`;
}

export interface RateLimiter {
  hit(key: string, windowSec: number, max: number): Promise<{ allowed: boolean; retryAfterSec: number }>;
}

/** Same fixed-window contract as the Postgres function (unit tests). */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const counts = new Map<string, number>();
  return {
    async hit(key, windowSec, max) {
      const t = Math.floor(now() / 1000);
      const start = t - (t % windowSec);
      const bucket = `${key}@${start}`;
      const count = (counts.get(bucket) ?? 0) + 1;
      counts.set(bucket, count);
      return { allowed: count <= max, retryAfterSec: count <= max ? 0 : start + windowSec - t };
    },
  };
}

/** Postgres via RPC (service role). Fails open: a DB hiccup must not take the demo down (logged). */
export function createSupabaseRateLimiter(db: SupabaseClient): RateLimiter {
  return {
    async hit(key, windowSec, max) {
      try {
        const { data, error } = await db.rpc("hit_rate_limit", { p_key: key, p_window_seconds: windowSec, p_max: max });
        if (error) throw new Error(error.message);
        const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after: number } | undefined;
        if (!row) throw new Error("no row");
        return { allowed: row.allowed, retryAfterSec: row.retry_after };
      } catch (err) {
        console.warn(`[rate-limit] ${key}: check failed, allowing`, (err as Error)?.message ?? err);
        return { allowed: true, retryAfterSec: 0 };
      }
    },
  };
}

/** The caller's IP. On Vercel, x-forwarded-for is set by the platform (first hop = the client). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "local";
}

/** RATE_LIMIT_SCALE multiplies every max (the e2e server, where every test shares 127.0.0.1). */
export function rateLimitScale(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Counts the request in every bucket at once (one DB round trip, not one per bucket) and refuses it if any bucket
 * is over its limit, with the longest wait. A refused request still counts everywhere, as with most limiters.
 * null = go ahead.
 */
export async function enforceLimits(limiter: RateLimiter, checks: { limit: RateLimit; key: string }[], scale = 1): Promise<Response | null> {
  const results = await Promise.all(checks.map(({ limit, key }) => limiter.hit(`${limit.name}:${key}`, limit.windowSec, Math.ceil(limit.max * scale))));
  const denied = results.filter((r) => !r.allowed);
  if (!denied.length) return null;
  const retryAfterSec = Math.max(1, ...denied.map((r) => r.retryAfterSec));
  return Response.json(
    { error: "rate_limited", message: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "retry-after": String(retryAfterSec), "cache-control": "no-store" } },
  );
}
