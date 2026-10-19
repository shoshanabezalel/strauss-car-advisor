import { APICallError } from "ai";

/**
 * How a model call failed, shared by the production fallback (fallback-model.ts) and the live evals'
 * retry wrapper (tests/evals/rate-limit.ts).
 */

export function isRateLimit(err: unknown): boolean {
  if (APICallError.isInstance(err) && err.statusCode === 429) return true;
  return /RESOURCE_EXHAUSTED|\b429\b/.test(messageOf(err));
}

/** 503 (Gemini "high demand", live run 19/10) or Anthropic's 529 "overloaded". */
export function isUnavailable(err: unknown): boolean {
  if (APICallError.isInstance(err) && (err.statusCode === 503 || err.statusCode === 529)) return true;
  if (APICallError.isInstance(err) && err.statusCode !== undefined) return false;
  return /\bUNAVAILABLE\b|\b503\b|\b529\b|high demand|overloaded/i.test(messageOf(err));
}

/** Worth one more try, or a switch to the fallback model. Bad requests and auth errors are not. */
export const isTransient = (err: unknown) => isRateLimit(err) || isUnavailable(err);

/** The wait the provider asks for: Retry-After, or Gemini's RetryInfo delay in the body. */
export function suggestedDelayMs(err: unknown): number | undefined {
  if (!APICallError.isInstance(err)) return undefined;
  const header = err.responseHeaders?.["retry-after"];
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000;
  const body = err.responseBody?.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return body ? Number(body[1]) * 1000 : undefined;
}

/** Every model we may use is rate-limited or overloaded right now. The chat shows a fixed Hebrew "busy" message. */
export class ModelBusyError extends Error {
  constructor(cause: unknown) {
    super("all models are busy", { cause });
    this.name = "ModelBusyError";
  }
}

function messageOf(err: unknown): string {
  return String((err as Error)?.message ?? err);
}
