import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  ASK_REP_MESSAGE,
  challengeOpeningMessage,
  createAgentState,
  createMemoryRepQueue,
  runAgentTurn,
  UNKNOWN_PARTICIPATION_MESSAGE,
  type AgentDeps,
} from "@/lib/agent";
import type { CompareOptionsOutput } from "@/lib/agent/schemas";
import { createMockModel, demoPrompts } from "@/lib/agent/mock-model";
import { loadConfig } from "@/lib/config";
import { compareOptions } from "@/lib/engine";
import { roundShekel } from "@/lib/format/money";
import { createMemoryVouSource } from "@/lib/vou";
import type { z } from "zod";

const config = loadConfig();
const a7 = config.challenge;
const deps = (): AgentDeps & { repQueue: ReturnType<typeof createMemoryRepQueue> } => ({
  config,
  vouSource: createMemoryVouSource([]),
  state: createAgentState(),
  repQueue: createMemoryRepQueue(),
});
const run = (messages: ModelMessage[], d: AgentDeps) => runAgentTurn({ model: createMockModel(config), messages, deps: d });

describe("mock model: A7 challenge script", () => {
  it("opening message → profile saved, comparison with the catalog default, flagged", async () => {
    const d = deps();
    const t = await run([{ role: "user", content: challengeOpeningMessage(config) }], d);
    expect(t.toolCalls.map((c) => c.toolName)).toEqual(["updateProfile", "compareOptions"]);
    const out = t.toolOutputs.find((o) => o.toolName === "compareOptions")!.output as z.output<typeof CompareOptionsOutput>;
    const engine = compareOptions(a7.profile, [a7.alternative], config);
    expect(out.today.display.net).toBe(roundShekel(engine.today.breakdown!.net));
    expect(out.options[0].display.net).toBe(roundShekel(engine.options[0].breakdown!.net));
    expect(out.options[0].needsConfirmation).toBe(true);
    expect(t.blocked).toBe(false);
  });

  it("then 'ask the representative' → askRepresentative for that car's participation", async () => {
    const d = deps();
    const first = await run([{ role: "user", content: challengeOpeningMessage(config) }], d);
    const t = await run(
      [{ role: "user", content: challengeOpeningMessage(config) }, ...first.responseMessages, { role: "user", content: ASK_REP_MESSAGE }],
      d,
    );
    expect(t.toolCalls).toEqual([{ toolName: "askRepresentative", input: expect.objectContaining({ field: "participation", carId: a7.repAnswer.carId }) }]);
    expect(d.repQueue.questions[0]).toMatchObject({ field: "participation", carId: a7.repAnswer.carId });
    expect(t.notices.some((n) => n.kind === "rep_question_open")).toBe(true);
    expect(t.blocked).toBe(false);
  });

  it("'ask the representative' with nothing unconfirmed → no tool call, no digits", async () => {
    const t = await run([{ role: "user", content: ASK_REP_MESSAGE }], deps());
    expect(t.toolCalls).toEqual([]);
    expect(t.text).not.toMatch(/\d/);
  });

  it("unknown current participation asks about the current situation", async () => {
    const d = deps();
    await run([{ role: "user", content: UNKNOWN_PARTICIPATION_MESSAGE }], d);
    expect(d.repQueue.questions[0]).toMatchObject({ field: "current" });
  });

  it("demo prompts include A7 and the ask-rep follow-up", () => {
    const texts = demoPrompts(config).map((p) => p.text);
    expect(texts).toEqual(expect.arrayContaining([challengeOpeningMessage(config), ASK_REP_MESSAGE]));
  });
});
