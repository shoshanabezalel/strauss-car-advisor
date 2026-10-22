import { describe, expect, it } from "vitest";
import { checkNumbers, createAgentState, createMemoryRepQueue, createToolHandlers, knownNames } from "@/lib/agent";
import { ASK_CONFIRM_LINE, compareReply } from "@/lib/agent/replies";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";

// User 22/10: the chat shows only the short result (new net, change from today) and, if needed, one question.
// No component lines or reasons: the breakdown lives in "איך זה מחושב?" alone.
const config = loadConfig();
const fmt = (n: number) => n.toLocaleString("en-US");

async function compareFor(e: (typeof config.employees.employees)[number]) {
  const state = createAgentState(structuredClone(e.profile));
  const tools = createToolHandlers({ config, vouSource: createMemoryVouSource([]), state, repQueue: createMemoryRepQueue() });
  const alt = e.alternative.kind === "car" ? { kind: "car" as const, carId: e.alternative.carId } : e.alternative;
  return { state, compare: await tools.compareOptions({ options: [alt] }) };
}

describe("compareReply (only the result)", () => {
  it.each(config.employees.employees.map((e) => [e.id, e] as const))("%s: the result line, then a question only if needed", async (_id, e) => {
    const { state, compare } = await compareFor(e);
    const text = compareReply(compare, config);
    const lines = text.split("\n");
    const opt = compare.options[0];
    const diff = opt.display.diffVsToday!;

    const change = diff === 0 ? "ללא שינוי מהיום" : `${fmt(Math.abs(diff))} ₪ ${diff > 0 ? "יותר" : "פחות"} מהיום`;
    expect(lines[0]).toBe(`הנטו החדש: ${fmt(opt.display.net!)} ₪ בחודש — ${change}.`);
    expect(lines.slice(1)).toEqual(opt.needsConfirmation ? [ASK_CONFIRM_LINE] : []);
    expect(text).not.toMatch(/שווי שימוש|לא כסף|הסיבה|ברוטו/);
    expect(checkNumbers(text, { toolOutputs: [compare], profile: state.profile, ignoreNames: knownNames(config) }).ok).toBe(true);
  });
});
