import { describe, expect, it } from "vitest";
import { checkNumbers, createAgentState, createMemoryRepQueue, createToolHandlers, knownNames } from "@/lib/agent";
import { compareReply, REP_ANSWERED_FALLBACK, repAnsweredReply } from "@/lib/agent/replies";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";

const config = loadConfig();
const a7 = config.challenge;

async function confirmedCompare() {
  const state = createAgentState(structuredClone(a7.profile));
  state.repParticipation = { [a7.repAnswer.carId]: a7.repAnswer.value };
  const tools = createToolHandlers({ config, vouSource: createMemoryVouSource([]), state, repQueue: createMemoryRepQueue() }, { origin: "rep" });
  return { state, compare: await tools.compareOptions({ options: [a7.alternative] }) };
}

describe("repAnsweredReply", () => {
  it("states the confirmed value and the new net, all numbers traceable", async () => {
    const { state, compare } = await confirmedCompare();
    const text = repAnsweredReply({ answer: a7.repAnswer, compare, config });
    expect(text).toMatch(/צוות הרכב/);
    expect(text).toContain(a7.repAnswer.value.toLocaleString("en-US"));
    expect(text).toContain(compare.options[0].display.net!.toLocaleString("en-US"));
    expect(text).not.toContain("צריך לאשר"); // no longer unconfirmed
    expect(checkNumbers(text, { toolOutputs: [compare, a7.repAnswer], profile: state.profile, ignoreNames: knownNames(config) }).ok).toBe(true);
  });

  it("without a comparison it still confirms, and invites the next step", () => {
    const text = repAnsweredReply({ answer: { field: "group", value: "ג" }, config });
    expect(text).toContain("ג");
    expect(text).not.toMatch(/\d/);
  });

  it("the fallback has no digits", () => {
    expect(REP_ANSWERED_FALLBACK).not.toMatch(/\d/);
  });
});

describe("compareReply (shared with the mock model)", () => {
  it("quotes display values only", async () => {
    const { compare } = await confirmedCompare();
    const text = compareReply(compare, config);
    expect(text).toContain(compare.options[0].display.net!.toLocaleString("en-US"));
  });
});
