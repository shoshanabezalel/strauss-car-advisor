import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { ModelBusyError } from "@/lib/agent/model-errors";
import { analyzeGaps, INSUFFICIENT_DATA_MESSAGE, MIN_GAPS_FOR_ANALYSIS } from "@/lib/gaps/analysis";
import { analysisInput, type GapSummary } from "@/lib/gaps/summary";

// G add-on: "ניתוח AI" reads only the code-computed summary, writes 3–5 Hebrew insights, and may only cite its numbers.
const summary: GapSummary = {
  windowDays: 7,
  total: 12,
  byType: { no_data: 3, referred_to_rep: 7, pending_confirmation: 0, unknown_vehicle: 2 },
  topTopics: [
    { type: "referred_to_rep", topic: "participation/CAR-10", label: "השתתפות עצמית: BYD ATTO 3", count: 6 },
    { type: "no_data", topic: "rules", label: "כללי החברה", count: 3 },
    { type: "unknown_vehicle", topic: "vehicle/id.7", label: "רכב שאינו בקטלוג: פולקסווגן ID.7", count: 2 },
  ],
  thisWeek: 9,
  lastWeek: 3,
};

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const reply = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });

const good = {
  insights: [
    { insight: "השתתפות עצמית ב-ATTO 3 לא מאושרת בקטלוג", action: "לעדכן בקטלוג את ההשתתפות לרכב זה", basedOnCount: 6 },
    { insight: "שאלות על כללי החברה שאין להן תשובה", action: "להוסיף לכללים את הנושאים החסרים", basedOnCount: 3 },
    { insight: "בשבוע האחרון נרשמו 9 פערים לעומת 3 בשבוע הקודם", action: "לבדוק מה השתנה ב-7 הימים האחרונים", basedOnCount: 9 },
  ],
};

describe("analyzeGaps", () => {
  it("sends the model the labeled summary and nothing else: no conversation ids, descriptions, rows, topic keys or catalog ids", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply(good)] });
    await analyzeGaps(summary, model);
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain(JSON.stringify(JSON.stringify(analysisInput(summary))).slice(1, -1)); // escaped inside the prompt
    for (const leak of ["conversation", "description", "conv-", "lastSeen", "createdAt", "participation/", "vehicle/"]) expect(sent).not.toContain(leak);
    expect(sent).not.toMatch(/CAR-\d+/);
    expect(sent).toContain("BYD ATTO 3");
  });

  it("a reply that names a catalog id (CAR-10) is rejected like an invented number", async () => {
    const withId = { insights: [{ ...good.insights[0], insight: "השתתפות עצמית ב-CAR-10 לא מאושרת" }, good.insights[1], good.insights[2]] };
    const model = new MockLanguageModelV4({ doGenerate: [reply(withId), reply(withId)] });
    expect((await analyzeGaps(summary, model)).status).toBe("failed");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("valid insights (3–5, Hebrew, numbers only from the summary, incl. the 7-day window) pass through", async () => {
    const res = await analyzeGaps(summary, new MockLanguageModelV4({ doGenerate: [reply(good)] }));
    expect(res).toEqual({ status: "ok", insights: good.insights });
  });

  it(`fewer than ${MIN_GAPS_FOR_ANALYSIS} gaps → "not enough data", and the model is never called`, async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply(good)] });
    const res = await analyzeGaps({ ...summary, total: MIN_GAPS_FOR_ANALYSIS - 1 }, model);
    expect(res).toEqual({ status: "insufficient", message: INSUFFICIENT_DATA_MESSAGE });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(INSUFFICIENT_DATA_MESSAGE).toMatch(/[א-ת]/);
    expect(INSUFFICIENT_DATA_MESSAGE).not.toMatch(/\d/);
  });

  it("a number that is not in the summary (computed or invented) → one regeneration, then a fixed message", async () => {
    const invented = { insights: [{ ...good.insights[0], insight: "עלייה של 200% בפניות" }, good.insights[1], good.insights[2]] };
    const wrongCount = { insights: [{ ...good.insights[0], basedOnCount: 12345 }, good.insights[1], good.insights[2]] };
    const model = new MockLanguageModelV4({ doGenerate: [reply(invented), reply(wrongCount)] });
    const res = await analyzeGaps(summary, model);
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(res.status).toBe("failed");
    expect(res.status === "failed" && res.message).not.toMatch(/\d/);
  });

  it("a regenerated valid answer is accepted", async () => {
    const invented = { insights: [{ ...good.insights[0], insight: "עלייה של 200% בפניות" }, good.insights[1], good.insights[2]] };
    const res = await analyzeGaps(summary, new MockLanguageModelV4({ doGenerate: [reply(invented), reply(good)] }));
    expect(res.status).toBe("ok");
  });

  it("fewer than 3 or more than 5 insights do not pass", async () => {
    const two = { insights: good.insights.slice(0, 2) };
    const res = await analyzeGaps(summary, new MockLanguageModelV4({ doGenerate: [reply(two), reply(two)] }));
    expect(res.status).toBe("failed");
  });

  it("all models busy → a Hebrew busy message", async () => {
    const busy = new MockLanguageModelV4({ doGenerate: () => Promise.reject(new ModelBusyError(new Error("503"))) });
    const res = await analyzeGaps(summary, busy);
    expect(res.status).toBe("busy");
    expect(res.status === "busy" && res.message).toMatch(/[א-ת]/);
  });
});
