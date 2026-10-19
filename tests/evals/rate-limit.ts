import { APICallError, wrapLanguageModel, type LanguageModel } from "ai";

/**
 * Each model call is retried on 429 / RESOURCE_EXHAUSTED with exponential backoff, honouring Retry-After or Gemini's
 * RetryInfo delay; and once on 503 / UNAVAILABLE ("high demand", live run 19/10), as planned for production (M7).
 * Use with maxRetries: 0 so the SDK doesn't retry too.
 */
const MAX_TRIES = 6;
const BASE_MS = 2_000;
/** A longer suggested wait means the daily quota is gone; waiting would just hang the run. */
const MAX_WAIT_MS = 120_000;

function isRateLimit(err: unknown): boolean {
  if (APICallError.isInstance(err) && err.statusCode === 429) return true;
  return /RESOURCE_EXHAUSTED|\b429\b/.test(String((err as Error)?.message ?? err));
}

function isUnavailable(err: unknown): boolean {
  if (APICallError.isInstance(err) && err.statusCode === 503) return true;
  return /\bUNAVAILABLE\b|\b503\b|high demand/i.test(String((err as Error)?.message ?? err));
}

function suggestedDelayMs(err: unknown): number | undefined {
  if (!APICallError.isInstance(err)) return undefined;
  const header = err.responseHeaders?.["retry-after"];
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000;
  const body = err.responseBody?.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return body ? Number(body[1]) * 1000 : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRateLimitRetry<T>(fn: () => PromiseLike<T>, label = "model call"): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isUnavailable(err)) {
        if (attempt > 1) throw err;
        console.warn(`[eval] ${label}: model unavailable (503), one retry in ${Math.round(BASE_MS / 1000)}s`);
        await sleep(BASE_MS);
        continue;
      }
      if (attempt >= MAX_TRIES || !isRateLimit(err)) throw err;
      const suggested = suggestedDelayMs(err);
      if (suggested !== undefined && suggested > MAX_WAIT_MS) {
        throw new Error(`${label}: daily quota exhausted (retry-after ${Math.round(suggested / 1000)}s), not waiting`, { cause: err });
      }
      const wait = (suggested ?? BASE_MS * 2 ** (attempt - 1)) + 250;
      console.warn(`[eval] ${label}: rate limited, retry ${attempt}/${MAX_TRIES - 1} in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

export function rateLimited(model: LanguageModel): LanguageModel {
  if (typeof model === "string") throw new Error("pass a model instance, not an id");
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: { specificationVersion: "v4", wrapGenerate: ({ doGenerate }) => withRateLimitRetry(doGenerate) },
  });
}
