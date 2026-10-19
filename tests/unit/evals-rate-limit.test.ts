import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRateLimitRetry } from "../evals/rate-limit";

// The live-eval retry wrapper: 429 backs off (several tries); 503 "high demand" is retried once (live run 19/10).
const apiError = (statusCode: number, message: string) =>
  new APICallError({ message, url: "https://example.test", requestBodyValues: {}, statusCode, responseHeaders: {}, isRetryable: true });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function run<T>(fn: () => Promise<T>) {
  const p = withRateLimitRetry(fn);
  const settled = p.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

describe("withRateLimitRetry", () => {
  it("503 is retried once, then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(apiError(503, "This model is currently experiencing high demand.")).mockResolvedValueOnce("ok");
    expect(await run(fn)).toEqual({ ok: true, v: "ok" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("503 twice → the second error is thrown (only one retry)", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(503, "UNAVAILABLE"));
    const res = await run(fn);
    expect(res.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("429 still backs off over several tries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429, "RESOURCE_EXHAUSTED"))
      .mockRejectedValueOnce(apiError(429, "RESOURCE_EXHAUSTED"))
      .mockRejectedValueOnce(apiError(429, "RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce("ok");
    expect(await run(fn)).toEqual({ ok: true, v: "ok" });
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("other errors are not retried", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(400, "bad request"));
    expect((await run(fn)).ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
