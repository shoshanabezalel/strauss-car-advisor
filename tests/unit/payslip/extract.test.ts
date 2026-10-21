import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "@/lib/config";
import { createModelExtractor } from "@/lib/payslip/extract";
import { createMockExtractor } from "@/lib/payslip/mock";

// F6: the model reads the payslip as a file part and answers in the strict contract; the code filters the rest.
const ranges = loadConfig().rules.payslip.ranges;
const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const replying = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  });
const fields = { baseSalary: 18500, commissions: 0, bonus: null, pensionPct: 6, studyFundPct: 2.5, creditPoints: 2.75 };
const raw = { ...fields, pensionDeduction: null, pensionWage: null, studyFundDeduction: null, studyFundWage: null };
const answer = (extra: Record<string, unknown> = {}) => JSON.stringify({ document: "payslip", fields: raw, absentLines: [], ...extra });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const file = { bytes: png, mediaType: "image/png" as const, name: "slip.png" };

describe("mock extractor (AGENT_MODEL=mock)", () => {
  it("E-001's fields with the bonus unread and commissions not on the payslip; *not-payslip* → not_payslip; refused in production", async () => {
    const config = loadConfig();
    const p = config.employees.employees[0].profile;
    const extract = createMockExtractor(config);
    expect(await extract(file)).toEqual({
      status: "ok",
      fields: { baseSalary: p.baseSalary, commissions: p.commissions, bonus: null, pensionPct: 6, studyFundPct: 2.5, creditPoints: p.creditPoints },
      notes: { commissions: "not_on_payslip" },
    });
    expect(await extract({ ...file, name: "not-payslip.png" })).toEqual({ status: "not_payslip" });
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createMockExtractor(config)).toThrow();
    vi.unstubAllEnvs();
  });
});

describe("model extractor", () => {
  it("sends the file as a file part with its media type, plus the instructions", async () => {
    const model = replying(answer());
    await createModelExtractor(model, ranges)(file);
    const [call] = model.doGenerateCalls;
    const user = call.prompt.find((m) => m.role === "user")!;
    const parts = user.content as { type: string; mediaType?: string; text?: string }[];
    expect(parts.find((p) => p.type === "file")).toMatchObject({ mediaType: "image/png" });
    expect(parts.find((p) => p.type === "text")?.text).toMatch(/employee/i);
    expect(call.responseFormat).toMatchObject({ type: "json" });
  });

  it("the instructions: salary-line labels, fund amounts, 0.00 is 0, absent lines, and no calculating", async () => {
    const model = replying(answer());
    await createModelExtractor(model, ranges)(file);
    const parts = model.doGenerateCalls[0].prompt.find((m) => m.role === "user")!.content as { type: string; text?: string }[];
    const text = parts.find((p) => p.type === "text")!.text!;
    for (const label of ["שכר יסוד", "משכורת", "שכר בסיס", "שכר שעתי", "ממ שוטף", "שכר לגמל"]) expect(text).toContain(label);
    expect(text).toMatch(/first regular salary line/i);
    expect(text).toMatch(/travel/i);
    expect(text).toContain("0.00");
    expect(text).toContain("absentLines");
    expect(text).toMatch(/never (estimate|compute|calculate)/i);
  });

  it("returns the sanitized fields", async () => {
    const res = await createModelExtractor(replying(answer({ fields: { ...raw, pensionPct: 60 } })), ranges)(file);
    expect(res).toEqual({ status: "ok", fields: { ...fields, pensionPct: null }, notes: {} });
  });

  it("not a payslip → not_payslip, no fields", async () => {
    const res = await createModelExtractor(replying(answer({ document: "not_payslip" })), ranges)(file);
    expect(res).toEqual({ status: "not_payslip" });
  });

  it("extra fields (name, ID, bank) or broken JSON → unreadable, nothing filled", async () => {
    const extra = answer({ fields: { ...raw, idNumber: "000000000", employeeName: "ישראל" } });
    expect(await createModelExtractor(replying(extra), ranges)(file)).toEqual({ status: "unreadable" });
    expect(await createModelExtractor(replying("not json"), ranges)(file)).toEqual({ status: "unreadable" });
  });
});
