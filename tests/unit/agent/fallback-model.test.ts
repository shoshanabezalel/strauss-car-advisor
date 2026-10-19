import { APICallError, type ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLOCKED_REPLY, createAgentState, createMemoryRepQueue, loadSystemPrompt, runAgentTurn, type AgentDeps } from "@/lib/agent";
import { withFallback } from "@/lib/agent/fallback-model";
import { isRateLimit, isTransient, isUnavailable, ModelBusyError, suggestedDelayMs } from "@/lib/agent/model-errors";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";

// M7: production model fallback (TECH-DESIGN §10). On 429 / 503: one retry of the primary, then the fallback model
// with the same tools, prompt and guard (only the LanguageModel changes), then ModelBusyError.
const config = loadConfig();
const e1 = config.employees.employees[0];
const attoId = e1.alternative.kind === "car" ? e1.alternative.carId : "";

const apiError = (statusCode: number, message = "error", headers: Record<string, string> = {}) =>
  new APICallError({ message, url: "https://example.test", requestBodyValues: {}, statusCode, responseHeaders: headers, isRetryable: true });

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });
let n = 0;
const toolCall = (toolName: string, input: unknown) => ({
  content: [{ type: "tool-call" as const, toolCallId: `f${++n}`, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage,
  warnings: [],
});
/** A model whose every call fails with this error. */
const failing = (err: unknown) => new MockLanguageModelV4({ doGenerate: () => Promise.reject(err) });

const deps = (): AgentDeps => ({ config, vouSource: createMemoryVouSource([]), state: createAgentState(e1.profile), repQueue: createMemoryRepQueue() });
const user = (t: string): ModelMessage[] => [{ role: "user", content: t }];
const GOOD = "הנטו שלך יעלה מ-11,032 ל-11,693 ₪, תוספת של 661 ₪.";
const INVENTED = "הנטו שלך יהיה 12,345 ₪.";
const noSleep = async () => {};

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("model errors", () => {
  it("429, 503 and Anthropic's 529 overloaded are transient; 400 / 401 / 500 are not", () => {
    expect(isRateLimit(apiError(429))).toBe(true);
    expect(isRateLimit(new Error("RESOURCE_EXHAUSTED: quota"))).toBe(true);
    expect(isUnavailable(apiError(503))).toBe(true);
    expect(isUnavailable(apiError(529, "Overloaded"))).toBe(true);
    expect(isUnavailable(new Error("This model is currently experiencing high demand"))).toBe(true);
    for (const s of [429, 503, 529]) expect(isTransient(apiError(s))).toBe(true);
    for (const s of [400, 401, 404, 500]) expect(isTransient(apiError(s))).toBe(false);
    expect(isTransient(new Error("boom"))).toBe(false);
  });

  it("suggested delay from Retry-After or Gemini's retryDelay", () => {
    expect(suggestedDelayMs(apiError(429, "x", { "retry-after": "3" }))).toBe(3000);
    const gemini = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 429, responseBody: '{"retryDelay": "1.5s"}' });
    expect(suggestedDelayMs(gemini)).toBe(1500);
    expect(suggestedDelayMs(new Error("x"))).toBeUndefined();
  });

  it("ModelBusyError keeps the cause", () => {
    const cause = apiError(503);
    const err = new ModelBusyError(cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.cause).toBe(cause);
  });
});

describe("withFallback", () => {
  it("success on the first try never touches the fallback", async () => {
    const primary = new MockLanguageModelV4({ doGenerate: [text("שלום")] });
    const fallback = new MockLanguageModelV4({ doGenerate: [text("גיבוי")] });
    const onFallback = vi.fn();
    const turn = await runAgentTurn({ model: withFallback(primary, fallback, { onFallback, sleep: noSleep }), messages: user("היי"), deps: deps(), maxRetries: 0 });
    expect(turn.text).toBe("שלום");
    expect(fallback.doGenerateCalls).toHaveLength(0);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("a transient error is retried once on the primary, after the delay", async () => {
    let calls = 0;
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++calls === 1) throw apiError(503);
        return text("שלום");
      },
    });
    const sleep = vi.fn(noSleep);
    const onFallback = vi.fn();
    const turn = await runAgentTurn({ model: withFallback(primary, undefined, { onFallback, sleep, retryDelayMs: 700 }), messages: user("היי"), deps: deps(), maxRetries: 0 });
    expect(turn.text).toBe("שלום");
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(700);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("a long Retry-After is capped at maxWaitMs", async () => {
    let calls = 0;
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++calls === 1) throw apiError(429, "slow down", { "retry-after": "60" });
        return text("שלום");
      },
    });
    const sleep = vi.fn(noSleep);
    await runAgentTurn({ model: withFallback(primary, undefined, { sleep, maxWaitMs: 2000 }), messages: user("היי"), deps: deps(), maxRetries: 0 });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("two transient errors → the fallback answers, onFallback fires once", async () => {
    const primary = failing(apiError(429));
    const fallback = new MockLanguageModelV4({ doGenerate: [text("שלום מהגיבוי")] });
    const onFallback = vi.fn();
    const turn = await runAgentTurn({ model: withFallback(primary, fallback, { onFallback, sleep: noSleep }), messages: user("היי"), deps: deps(), maxRetries: 0 });
    expect(turn.text).toBe("שלום מהגיבוי");
    expect(primary.doGenerateCalls).toHaveLength(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("the fallback gets the same system prompt and the same tools as the primary", async () => {
    const primary = failing(apiError(503));
    const fallback = new MockLanguageModelV4({ doGenerate: [text("שלום")] });
    await runAgentTurn({ model: withFallback(primary, fallback, { sleep: noSleep }), messages: user("היי"), deps: deps(), maxRetries: 0 });
    const [p, f] = [primary.doGenerateCalls[0], fallback.doGenerateCalls[0]];
    expect(f.prompt[0]).toEqual({ role: "system", content: loadSystemPrompt() });
    expect(f.prompt).toEqual(p.prompt);
    expect(f.tools?.map((t) => t.name).sort()).toEqual(p.tools?.map((t) => t.name).sort());
  });

  it("once switched, the rest of the turn stays on the fallback (tool steps and the reply)", async () => {
    let primaryCalls = 0;
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        primaryCalls++;
        throw apiError(503);
      },
    });
    const fallback = new MockLanguageModelV4({ doGenerate: [toolCall("compareOptions", { options: [{ kind: "car", carId: attoId }] }), text(GOOD)] });
    const turn = await runAgentTurn({ model: withFallback(primary, fallback, { sleep: noSleep }), messages: user("ATTO 3?"), deps: deps(), maxRetries: 0 });
    expect(turn).toMatchObject({ text: GOOD, blocked: false });
    expect(primaryCalls).toBe(2);
    expect(fallback.doGenerateCalls).toHaveLength(2);
  });

  it("the number-guard still applies on the fallback: invented numbers twice → blocked", async () => {
    const fallback = new MockLanguageModelV4({ doGenerate: [text(INVENTED), text(INVENTED)] });
    const turn = await runAgentTurn({ model: withFallback(failing(apiError(503)), fallback, { sleep: noSleep }), messages: user("היי"), deps: deps(), maxRetries: 0 });
    expect(turn).toMatchObject({ text: BLOCKED_REPLY, blocked: true, attempts: 2 });
  });

  it("no fallback configured → ModelBusyError after the retry", async () => {
    const primary = failing(apiError(503));
    await expect(runAgentTurn({ model: withFallback(primary, undefined, { sleep: noSleep }), messages: user("היי"), deps: deps(), maxRetries: 0 })).rejects.toBeInstanceOf(ModelBusyError);
    expect(primary.doGenerateCalls).toHaveLength(2);
  });

  it("the fallback also overloaded → ModelBusyError", async () => {
    const model = withFallback(failing(apiError(429)), failing(apiError(529, "Overloaded")), { sleep: noSleep });
    await expect(runAgentTurn({ model, messages: user("היי"), deps: deps(), maxRetries: 0 })).rejects.toBeInstanceOf(ModelBusyError);
  });

  it("a non-transient error is rethrown as is: no retry, no fallback", async () => {
    const primary = failing(apiError(400, "bad request"));
    const fallback = new MockLanguageModelV4({ doGenerate: [text("שלום")] });
    const err = await runAgentTurn({ model: withFallback(primary, fallback, { sleep: noSleep }), messages: user("היי"), deps: deps(), maxRetries: 0 }).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ModelBusyError);
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(fallback.doGenerateCalls).toHaveLength(0);
  });
});
