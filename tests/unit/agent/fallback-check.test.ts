import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { checkModelAnswers } from "@/lib/agent/fallback-check";

// M7: the deployed suite checks that the configured fallback model really answers (a listed model can 404).
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const reply = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });

describe("checkModelAnswers", () => {
  it("a model that replies → ok, with the time it took", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply("ok")] });
    const res = await checkModelAnswers(model);
    expect(res).toMatchObject({ ok: true });
    expect(res.ms).toBeGreaterThanOrEqual(0);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("an API error (e.g. 404 model not available) → not ok, with the provider's message and status", async () => {
    const gone = new APICallError({ message: "This model is no longer available to new users.", url: "u", requestBodyValues: {}, statusCode: 404 });
    const res = await checkModelAnswers(new MockLanguageModelV4({ doGenerate: () => Promise.reject(gone) }));
    expect(res).toMatchObject({ ok: false, status: 404, error: expect.stringContaining("no longer available") });
  });

  it("an empty reply is not an answer", async () => {
    expect(await checkModelAnswers(new MockLanguageModelV4({ doGenerate: [reply("  ")] }))).toMatchObject({ ok: false });
  });

  it("one call only: no SDK retries (the check must report the first failure)", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++;
        throw new APICallError({ message: "high demand", url: "u", requestBodyValues: {}, statusCode: 503, isRetryable: true });
      },
    });
    await checkModelAnswers(model);
    expect(calls).toBe(1);
  });
});
