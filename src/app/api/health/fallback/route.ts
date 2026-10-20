import { checkModelAnswers } from "@/lib/agent/fallback-check";
import { createFallbackOnlyModel } from "@/lib/agent/model";
import { chatDeps } from "@/lib/chat/server";
import { fallbackConfig } from "@/lib/env";
import { hasRepSession, NO_STORE, unauthorized } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/**
 * POST /api/health/fallback → one real call to the configured fallback model alone (FALLBACK_MODEL), so the deployed
 * suite can prove it answers before the primary is ever busy (M7). 200 { ok, provider, model, ms } or 503 with the
 * provider's error. Rep session only and tightly rate-limited: every hit costs an LLM call.
 */
export async function POST(request: Request) {
  const { rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.fallbackCheckIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;
  if (!hasRepSession(request)) return unauthorized();

  let cfg;
  try {
    cfg = fallbackConfig();
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503, headers: NO_STORE });
  }
  if (!cfg) return Response.json({ ok: false, error: "no fallback model configured (FALLBACK_MODEL)" }, { status: 503, headers: NO_STORE });

  const res = await checkModelAnswers(createFallbackOnlyModel());
  if (!res.ok) console.warn(`[health] fallback ${cfg.model} did not answer: ${res.error}`);
  return Response.json({ ...res, provider: cfg.provider, model: cfg.model }, { status: res.ok ? 200 : 503, headers: NO_STORE });
}
