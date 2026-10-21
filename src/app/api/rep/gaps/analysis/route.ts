import { createAgentModel } from "@/lib/agent/model";
import { chatDeps } from "@/lib/chat/server";
import { analyzeGaps } from "@/lib/gaps/analysis";
import { summarizeGaps } from "@/lib/gaps/summary";
import { hasRepSession, NO_STORE, unauthorized } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

// One structured generation (+ at most one regeneration) on the same models as the agent: Gemini, retry, fallback.
export const maxDuration = 90;
const ANALYSIS_BUDGET_MS = 60_000;

/**
 * POST /api/rep/gaps/analysis → "ניתוח AI" (G add-on): 3–5 Hebrew insights from the code-computed summary only
 * (src/lib/gaps/analysis.ts). Rep session only; 10 per 10 minutes per IP (each one is an LLM call).
 */
export async function POST(request: Request) {
  const { store, source, rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.gapAnalysisIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;
  if (!hasRepSession(request)) return unauthorized();

  const summary = summarizeGaps(await store.listGapRows(source), new Date());
  const result = await analyzeGaps(summary, createAgentModel(), { abortSignal: AbortSignal.timeout(ANALYSIS_BUDGET_MS) });
  return Response.json(result, { headers: NO_STORE });
}
