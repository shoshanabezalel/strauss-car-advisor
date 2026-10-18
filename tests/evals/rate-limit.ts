import { APICallError, wrapLanguageModel, type LanguageModel } from "ai";

/**
 * Free-tier Gemini has per-minute limits. Each model call is retried on 429 / RESOURCE_EXHAUSTED with exponential
 * backoff, honouring Retry-After or Gemini's RetryInfo delay. Use with maxRetries: 0 so the SDK doesn't retry too.
 */
const MAX_TRIES = 6;
const BASE_MS = 2_000;

function isRateLimit(err: unknown): boolean {
  if (APICallError.isInstance(err) && err.statusCode === 429) return true;
  return /RESOURCE_EXHAUSTED|\b429\b/.test(String((err as Error)?.message ?? err));
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
      if (attempt >= MAX_TRIES || !isRateLimit(err)) throw err;
      const wait = (suggestedDelayMs(err) ?? BASE_MS * 2 ** (attempt - 1)) + 250;
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
