import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgentState, createMemoryRepQueue, createToolHandlers, createTools, runAgentTurn, type AgentDeps } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";

// Live eval 19/10: the model called updateProfile twice per case. The model-facing schema still offered the
// rep-only fields (participationSource, source "rep") that the agent-origin tools reject since M5. The schema the
// model sees must not offer them, and a tool error must be visible in the turn so evals can log it.
const config = loadConfig();
const e1 = config.employees.employees[0];
const deps = (): AgentDeps => ({ config, vouSource: createMemoryVouSource([]), state: createAgentState(structuredClone(e1.profile)), repQueue: createMemoryRepQueue() });
const jsonSchema = (name: string) => {
  const t = createTools(deps())[name] as { inputSchema: z.ZodType };
  return JSON.stringify(z.toJSONSchema(t.inputSchema));
};

describe("model-facing tool schemas", () => {
  it.each(["updateProfile", "compareOptions", "checkEligibility"])("%s offers no participationSource", (name) => {
    expect(jsonSchema(name)).not.toContain("participationSource");
  });

  it("updateProfile names every profile field as a property (live eval 19/10: the model guessed field names)", () => {
    const schema = z.toJSONSchema((createTools(deps()).updateProfile as { inputSchema: z.ZodType }).inputSchema) as unknown as {
      properties: { profile: { properties: Record<string, unknown> } };
    };
    expect(Object.keys(schema.properties.profile.properties).sort()).toEqual(
      ["occupation", "group", "baseSalary", "commissions", "bonus", "pensionPct", "studyFundPct", "creditPoints", "childrenUnder23", "current"].sort(),
    );
    expect(JSON.stringify(schema)).not.toContain('"updates"');
  });

  it("a flat call saves the same profile as the handler's update list", async () => {
    const p = e1.profile;
    const asSaid = (f: number) => +(f * 100).toFixed(4);
    const flat = { ...p, pensionPct: asSaid(p.pensionPct), studyFundPct: asSaid(p.studyFundPct) };
    const viaTool = deps();
    viaTool.state = createAgentState();
    const t = createTools(viaTool).updateProfile as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> };
    await t.execute({ source: "employee", profile: flat }, { toolCallId: "x", messages: [] });

    const viaHandler = deps();
    viaHandler.state = createAgentState();
    await createToolHandlers(viaHandler).updateProfile({
      updates: Object.entries(flat).map(([field, value]) => ({ field, value, source: "employee" })) as never,
    });
    expect(viaTool.state).toEqual(viaHandler.state);
  });

  it("an empty profile is rejected by the schema", () => {
    const schema = (createTools(deps()).updateProfile as { inputSchema: z.ZodType }).inputSchema;
    expect(schema.safeParse({ source: "employee", profile: {} }).success).toBe(false);
  });

  it("updateProfile offers no rep source", () => {
    const s = jsonSchema("updateProfile");
    expect(s).toContain('"employee"');
    expect(s).not.toContain('"rep"');
  });

  it("a participationSource the model sends anyway is stripped, not an error", async () => {
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const current = e1.profile.current;
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "updateProfile",
              input: JSON.stringify({ source: "employee", profile: { current: { ...current, participationSource: "employee" } } }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        { content: [{ type: "text", text: "רשמתי." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
      ],
    });
    const d = deps();
    const turn = await runAgentTurn({ model, messages: [{ role: "user", content: "היי" }], deps: d });
    expect(turn.toolErrors).toEqual([]);
    expect(turn.toolOutputs.map((o) => o.toolName)).toEqual(["updateProfile"]);
  });
});

describe("spoofing a rep confirmation", () => {
  it('participationSource "rep" sent by the model is stripped: no tool error, saved as the employee\'s', async () => {
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const current = e1.profile.current;
    if (current.kind !== "car") throw new Error("E-001 has a car");
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "c1",
              toolName: "updateProfile",
              input: JSON.stringify({ source: "employee", profile: { current: { ...current, participation: 999, participationSource: "rep" } } }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        { content: [{ type: "text", text: "רשמתי." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
      ],
    });
    const d = deps();
    const turn = await runAgentTurn({ model, messages: [{ role: "user", content: "היי" }], deps: d });
    expect(turn.toolErrors).toEqual([]);
    expect(d.state.profile.current).toMatchObject({ kind: "car", carId: current.carId, participation: 999, participationSource: "employee" });
    expect(d.state.sources.current).toBe("employee");
  });
});

describe("tool errors are reported by the turn", () => {
  it("a rejected tool call shows up in toolErrors", async () => {
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{ type: "tool-call", toolCallId: "c1", toolName: "askRepresentative", input: JSON.stringify({ question: "?", field: "participation", carId: "CAR-99" }) }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        { content: [{ type: "text", text: "שלחתי." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
      ],
    });
    const turn = await runAgentTurn({ model, messages: [{ role: "user", content: "היי" }], deps: deps() });
    expect(turn.toolErrors).toEqual([{ toolName: "askRepresentative", error: expect.stringContaining("CAR-99") }]);
  });
});
