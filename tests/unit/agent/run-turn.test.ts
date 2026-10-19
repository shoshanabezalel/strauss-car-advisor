import type { ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  BLOCKED_REPLY,
  createAgentState,
  createMemoryRepQueue,
  loadSystemPrompt,
  runAgentTurn,
  type AgentDeps,
} from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import type { EmployeeProfile } from "@/lib/engine";
import { createMemoryVouSource } from "@/lib/vou";

// Deterministic: a scripted mock model, no network. Each script entry is one model call.
const config = loadConfig();
const e1 = config.employees.employees[0]; // E-001: COROLLA CROSS → ATTO 3, net 11,032 → 11,693 (+661)
const attoId = e1.alternative.kind === "car" ? e1.alternative.carId : "";

type Step = { tool: string; input: unknown } | { text: string };
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
let callId = 0;
function mockModel(script: Step[]) {
  return new MockLanguageModelV4({
    doGenerate: script.map((s) =>
      "text" in s
        ? { content: [{ type: "text", text: s.text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }
        : {
            content: [{ type: "tool-call", toolCallId: `c${++callId}`, toolName: s.tool, input: JSON.stringify(s.input) }],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
            warnings: [],
          },
    ),
  });
}

function deps(profile: EmployeeProfile = e1.profile): AgentDeps {
  return { config, vouSource: createMemoryVouSource([]), state: createAgentState(profile), repQueue: createMemoryRepQueue() };
}
const user = (text: string): ModelMessage[] => [{ role: "user", content: text }];
const compareAtto = { tool: "compareOptions", input: { options: [{ kind: "car", carId: attoId }] } };
const GOOD = "הנטו שלך יעלה מ-11,032 ל-11,693 ₪, תוספת של 661 ₪.";
const INVENTED = "הנטו שלך יהיה 12,345 ₪.";

describe("runAgentTurn", () => {
  it("sends the system prompt from the repo file", async () => {
    const model = mockModel([{ text: "שלום! מה שכר הבסיס שלך?" }]);
    await runAgentTurn({ model, messages: user("היי"), deps: deps({}) });
    expect(model.doGenerateCalls[0].prompt[0]).toEqual({ role: "system", content: loadSystemPrompt() });
  });

  it("tool call → result → reply quoting display values passes the guard", async () => {
    const model = mockModel([compareAtto, { text: GOOD }]);
    const turn = await runAgentTurn({ model, messages: user("מה יקרה אם אעבור ל-ATTO 3?"), deps: deps() });
    expect(turn).toMatchObject({ text: GOOD, blocked: false, attempts: 1, guard: { ok: true, invented: [] } });
    expect(turn.toolCalls).toEqual([{ toolName: "compareOptions", input: compareAtto.input }]);
    expect(turn.toolOutputs[0].toolName).toBe("compareOptions");
    expect(turn.notices).toContainEqual({ kind: "participation_unconfirmed", carId: attoId });
  });

  it("an invented number triggers one regeneration with a correction note", async () => {
    const model = mockModel([compareAtto, { text: INVENTED }, { text: GOOD }]);
    const turn = await runAgentTurn({ model, messages: user("ומה הנטו?"), deps: deps() });
    expect(turn).toMatchObject({ text: GOOD, blocked: false, attempts: 2, guard: { ok: true } });

    const retry = model.doGenerateCalls[2].prompt;
    const system = retry[0];
    expect(system.role === "system" && system.content).toContain("12,345");
    // the retry still sees this turn's tool result, so it can quote it
    expect(retry.some((m) => m.role === "tool")).toBe(true);
    // the rejected reply does not stay in the conversation history
    expect(JSON.stringify(turn.responseMessages)).not.toContain("12,345");
  });

  it("an invented number on both attempts blocks the reply", async () => {
    const model = mockModel([compareAtto, { text: INVENTED }, { text: INVENTED }]);
    const turn = await runAgentTurn({ model, messages: user("ומה הנטו?"), deps: deps() });
    expect(turn).toMatchObject({ text: BLOCKED_REPLY, blocked: true, attempts: 2, guard: { ok: false, invented: ["12,345"] } });
    expect(BLOCKED_REPLY).not.toMatch(/\d/);
    const last = turn.responseMessages.at(-1);
    expect(last).toEqual({ role: "assistant", content: BLOCKED_REPLY });
    expect(JSON.stringify(turn.responseMessages)).not.toContain("12,345");
  });

  it("a number from an earlier turn needs a fresh tool call", async () => {
    const model = mockModel([{ text: "כמו שאמרתי, 11,693 ₪." }, { text: "כמו שאמרתי, 11,693 ₪." }]);
    const turn = await runAgentTurn({ model, messages: user("תזכיר לי?"), deps: deps() });
    expect(turn.blocked).toBe(true);
  });

  it("profile values and car names may be echoed without a tool call", async () => {
    const model = mockModel([{ text: "רשמתי 2 ילדים ושכר בסיס 18,500. רוצה לבדוק את ATTO 3?" }]);
    const turn = await runAgentTurn({ model, messages: user("נכון"), deps: deps() });
    expect(turn.guard).toEqual({ ok: true, invented: [] });
  });

  it("missing data surfaces as a notice", async () => {
    const model = mockModel([
      { tool: "updateProfile", input: { source: "employee", profile: { group: "ג" } } },
      { text: "תודה! מה שכר הבסיס שלך?" },
    ]);
    const d = deps({});
    const turn = await runAgentTurn({ model, messages: user("אני בקבוצה ג"), deps: d });
    expect(d.state.profile.group).toBe("ג");
    expect(turn.notices).toContainEqual({ kind: "missing", fields: expect.arrayContaining(["baseSalary", "current"]) });
  });

  it("a full profile is saved with a single updateProfile call", async () => {
    // Scripted model, so this proves one call is enough (the live evals check the model actually does it).
    const p = e1.profile;
    const asSaid = (f: number) => +(f * 100).toFixed(4);
    // The model-facing shape (M6): one object with named properties.
    const profile = { ...p, pensionPct: asSaid(p.pensionPct), studyFundPct: asSaid(p.studyFundPct) };
    const model = mockModel([
      { tool: "getCatalog", input: { scope: "all" } },
      { tool: "updateProfile", input: { source: "employee", profile } },
      compareAtto,
      { text: GOOD },
    ]);
    const d = deps({});
    const turn = await runAgentTurn({ model, messages: user("כל הפרטים שלי"), deps: d });

    const count = (name: string) => turn.toolCalls.filter((c) => c.toolName === name).length;
    expect(count("updateProfile")).toBe(1);
    expect(count("getCatalog")).toBe(1);
    const saved = turn.toolOutputs.find((o) => o.toolName === "updateProfile")!.output;
    expect(saved).toMatchObject({ ok: true, missing: [] });
    expect(turn.guard.ok).toBe(true);
    expect(turn.notices.some((n) => n.kind === "missing")).toBe(false);
  });

  it("responseMessages carry the tool round-trip and the final reply", async () => {
    const model = mockModel([compareAtto, { text: GOOD }]);
    const turn = await runAgentTurn({ model, messages: user("?"), deps: deps() });
    expect(turn.responseMessages.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
  });
});
