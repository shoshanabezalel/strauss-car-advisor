import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, runAgentTurn, type AgentEvent } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource, type VouSource } from "@/lib/vou";

const config = loadConfig();
const e1 = config.employees.employees[0];
const attoId = e1.alternative.kind === "car" ? e1.alternative.carId : "";
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const stop = { unified: "stop", raw: undefined } as const;
const toolCall = (toolName: string, input: unknown) => ({
  content: [{ type: "tool-call" as const, toolCallId: `t-${toolName}`, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage,
  warnings: [],
});
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], finishReason: stop, usage, warnings: [] });

const GOOD = "הנטו שלך יעלה ל-11,693 ₪, עלייה של 661 ₪.";
const INVENTED = "הנטו שלך יהיה 12,345 ₪.";

// A DB that is down: the tool's handler throws.
const brokenVou: VouSource = {
  findByKey: () => Promise.reject(new Error("db down")),
  searchByName: () => Promise.reject(new Error("db down")),
};

async function run(script: ReturnType<typeof text>[], vouSource: VouSource = createMemoryVouSource([])) {
  const events: AgentEvent[] = [];
  const turn = await runAgentTurn({
    model: new MockLanguageModelV4({ doGenerate: script }),
    messages: [{ role: "user", content: "?" }],
    deps: { config, vouSource, state: createAgentState(e1.profile), repQueue: createMemoryRepQueue() },
    onEvent: (e) => events.push(e),
  });
  return { turn, events };
}

describe("runAgentTurn events", () => {
  it("emits thinking → tool running/done → checking, in order", async () => {
    const { events } = await run([toolCall("compareOptions", { options: [{ kind: "car", carId: attoId }] }) as never, text(GOOD)]);
    expect(events).toEqual([
      { type: "status", status: "thinking" },
      { type: "tool", name: "compareOptions", state: "running" },
      { type: "tool", name: "compareOptions", state: "done" },
      { type: "status", status: "checking" },
    ]);
  });

  it("a tool that throws emits an error event", async () => {
    const vouCall = toolCall("getValueOfUse", { makeCode: "01014", modelCode: "00003" }) as never;
    const { events } = await run([vouCall, text("לא הצלחתי לבדוק כרגע.")], brokenVou);
    expect(events).toContainEqual({ type: "tool", name: "getValueOfUse", state: "running" });
    expect(events).toContainEqual({ type: "tool", name: "getValueOfUse", state: "error" });
  });

  it("a guard violation emits regenerating before the second attempt", async () => {
    const { events, turn } = await run([
      toolCall("compareOptions", { options: [{ kind: "car", carId: attoId }] }) as never,
      text(INVENTED),
      text(GOOD),
    ]);
    expect(turn.attempts).toBe(2);
    const statuses = events.filter((e) => e.type === "status").map((e) => (e as { status: string }).status);
    expect(statuses).toEqual(["thinking", "checking", "regenerating", "checking"]);
  });

  it("no event carries model text", async () => {
    const { events } = await run([text(INVENTED), text(INVENTED)]);
    const all = JSON.stringify(events);
    expect(all).not.toContain("12,345");
    expect(all).not.toContain("הנטו");
  });
});
