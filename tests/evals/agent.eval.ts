import type { ModelMessage } from "ai";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  ASK_REP_MESSAGE,
  carName as carNameOf,
  challengeOpeningMessage,
  createAgentState,
  createMemoryRepQueue,
  openingMessage as openingMessageOf,
  runAgentTurn,
  type AgentDeps,
  type AgentTurn,
} from "@/lib/agent";
import { createMockModel } from "@/lib/agent/mock-model";
import { createFallbackOnlyModel, createPrimaryModel } from "@/lib/agent/model";
import { fallbackConfig } from "@/lib/env";
import type { CompareOptionsOutput } from "@/lib/agent/schemas";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { answerRepQuestion } from "@/lib/chat/rep-answer";
import { loadConfig, type SampleEmployee } from "@/lib/config";
import { noopNotifier } from "@/lib/realtime/notifier";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../unit/vou/fixture";
import { rateLimited } from "./rate-limit";

// Live evals (`npm run eval:agent`): the real model drives the tools from a Hebrew chat. Not part of `npm test`.
loadEnv({ path: ".env.local", quiet: true });
// Live only: AGENT_MODEL=mock (local dev) would make these evals test the script, not the model.
// EVAL_TARGET=fallback runs the same cases on the fallback model alone (FALLBACK_MODEL, e.g. gemini-3.8-flash,
// or Claude with ANTHROPIC_API_KEY): the prompt was tuned on the primary model (M7).
const target = process.env.EVAL_TARGET === "fallback" ? "fallback" : "primary";
const fallback = target === "fallback" ? fallbackConfig() : undefined;
const hasKey =
  (target === "fallback" ? Boolean(fallback) : Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)) && process.env.AGENT_MODEL !== "mock";
const evalModelName = target === "fallback" ? `fallback ${fallback?.model}` : `primary ${process.env.AGENT_MODEL || "default"}`;
const createEvalModel = () => (target === "fallback" ? createFallbackOnlyModel() : createPrimaryModel());

const config = loadConfig();
const MAX_TURNS = 3;
const FOLLOW_UP = "כן, הכול נכון. תחשב בבקשה.";

const carName = (id: string) => carNameOf(config, id);
const openingMessage = (e: SampleEmployee) => openingMessageOf(config, e);

function newDeps(): AgentDeps {
  return { config, vouSource: createMemoryVouSource(loadVouRecords()), state: createAgentState(), repQueue: createMemoryRepQueue() };
}

/** Chat until a turn produces a net for a requested option, or MAX_TURNS. Every turn must pass the guard. */
async function chat(first: string, deps: AgentDeps, done: (t: AgentTurn) => boolean) {
  const model = rateLimited(createEvalModel());
  let messages: ModelMessage[] = [{ role: "user", content: first }];
  const turns: AgentTurn[] = [];
  for (let i = 0; i < MAX_TURNS; i++) {
    const turn = await runAgentTurn({ model, messages, deps, maxRetries: 0 });
    turns.push(turn);
    logTurn(i + 1, turn);
    if (done(turn)) break;
    messages = [...messages, ...turn.responseMessages, { role: "user", content: FOLLOW_UP }];
  }
  return turns;
}

/** Tool names, every call's input and every rejected call, so a failing case shows why. */
function logTurn(n: number, turn: AgentTurn) {
  const calls = turn.toolCalls.map((c) => `  ${c.toolName} ${JSON.stringify(c.input)}`).join("\n");
  const errors = turn.toolErrors.map((e) => `  ${e.toolName}: ${e.error}`).join("\n");
  const invented = turn.guard.ok ? "" : ` invented=${turn.guard.invented.join(",")}`;
  console.log(
    `[eval] turn ${n}: tools=${turn.toolCalls.map((c) => c.toolName).join(",")} guard=${turn.guard.ok}${invented}\n` +
      `[eval] calls:\n${calls}\n${errors ? `[eval] tool errors:\n${errors}\n` : ""}${turn.text}`,
  );
}

const hasOptionNet = (t: AgentTurn) =>
  t.toolOutputs.some(
    (o) => o.toolName === "compareOptions" && (o.output as { options: { display: { net?: number } }[] }).options.some((r) => r.display.net !== undefined),
  );

const firstLine = (text: string) => text.split("\n").find((l) => l.trim()) ?? "";
const mentions = (text: string, n: number) => text.includes(n.toLocaleString("en-US")) || text.includes(String(n));

describe.skipIf(!hasKey)(`agent evals (live model: ${evalModelName})`, () => {
  for (const e of config.employees.employees) {
    it(`${e.id}: reaches the sheet's net via chat, with no invented numbers`, async () => {
      const deps = newDeps();
      const turns = await chat(openingMessage(e), deps, hasOptionNet);
      const last = turns.at(-1)!;

      for (const t of turns) expect(t.blocked, `blocked: ${t.guard.invented.join(", ")}`).toBe(false);
      const called = turns.flatMap((t) => t.toolCalls.map((c) => c.toolName));
      expect(called).toContain("updateProfile");
      expect(called).toContain("compareOptions");
      // Efficiency (prompt): the full profile goes in one updateProfile call; at most one catalog lookup.
      expect(called.filter((n) => n === "updateProfile"), called.join(",")).toHaveLength(1);
      expect(called.filter((n) => n === "getCatalog").length, called.join(",")).toBeLessThanOrEqual(1);

      // Prompt rule: the first line after compareOptions states the new net and the diff, from display.
      const line = firstLine(last.text);
      expect(mentions(line, e.expected.netAlt), `first line: ${line}`).toBe(true);
      expect(mentions(line, Math.abs(e.expected.diff)), `first line: ${line}`).toBe(true);
      // Phrasing: עלייה / ירידה with the absolute value, never a minus sign.
      expect(line).toContain(e.expected.diff > 0 ? "עלייה" : "ירידה");
      expect(line, `first line: ${line}`).not.toMatch(/(?<![\u0590-\u05FF])[-−]\s*\d/); // "ל-5,078" is a Hebrew prefix, not a sign

      if (e.alternative.kind === "car") {
        const carId = e.alternative.carId;
        expect(last.notices).toContainEqual({ kind: "participation_unconfirmed", carId });
        expect(last.text).toContain("השתתפות");
      }
    });
  }

  it("A12: unknown participation for a new car → flagged or sent to the representative, no invented number", async () => {
    const e = config.employees.employees[0];
    const deps = newDeps();
    const msg = `${openingMessage(e).replace(e.question, "")} אני שוקל/ת לעבור ל-${carName("CAR-11")}, אבל אין לי מושג מה ההשתתפות העצמית בו.`;
    const turns = await chat(msg, deps, hasOptionNet);
    for (const t of turns) expect(t.blocked).toBe(false);
    const notices = turns.flatMap((t) => t.notices);
    const askedRep = turns.some((t) => t.toolCalls.some((c) => c.toolName === "askRepresentative"));
    expect(askedRep || notices.some((n) => n.kind === "participation_unconfirmed")).toBe(true);
    expect(turns.at(-1)!.text).toContain("השתתפות");
  });

  it("A7: after the rep confirmed the participation, the live model continues without asking again", async () => {
    // Setup without quota: the scripted model for the opening and "ask the rep", then the rep's answer as data.
    const store = createMemoryStore();
    const vouSource = createMemoryVouSource(loadVouRecords());
    const send = async (text: string, model: Parameters<typeof handleChatTurn>[0]["model"], conversationId?: string) => {
      const events: ChatEvent[] = [];
      await handleChatTurn({ store, model, config, vouSource, conversationId, text, source: "e2e", ownerHash: "e".repeat(64), emit: (e) => events.push(e), maxRetries: 0 });
      return events;
    };
    const resultOf = (events: ChatEvent[]) => events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }> | undefined;

    const opening = resultOf(await send(challengeOpeningMessage(config), createMockModel(config)));
    const id = opening!.conversationId;
    const asked = resultOf(await send(ASK_REP_MESSAGE, createMockModel(config), id));
    const q = asked?.notices.find((n) => n.kind === "rep_question_open");
    if (q?.kind !== "rep_question_open") throw new Error("the scripted setup did not open a rep question");
    const answered = await answerRepQuestion({ store, config, vouSource, notifier: noopNotifier, questionId: q.questionId, answer: config.challenge.repAnswer });
    expect(answered.ok).toBe(true);
    const confirmed = (await store.load(id))!.comparison!;

    // One live turn on the merged history (toModelHistory).
    const events = await send(`תודה! אז מה הנטו שלי עכשיו עם ה-${carName(config.challenge.repAnswer.carId)}?`, rateLimited(createEvalModel()), id);
    const error = events.find((e) => e.type === "error");
    expect(error, JSON.stringify(error)).toBeUndefined();
    const result = resultOf(events)!;
    const tools = events.flatMap((e) => (e.type === "tool" && e.state === "running" ? [e.name] : []));
    const toolErrors = events.flatMap((e) => (e.type === "tool" && e.state === "error" ? [e.name] : []));
    console.log(`[eval] A7 live turn: tools=${tools.join(",")} errors=${toolErrors.join(",")} blocked=${result.blocked}\n${result.reply}`);

    expect(result.blocked).toBe(false);
    expect(tools).not.toContain("askRepresentative");
    expect(result.notices.some((n) => n.kind === "participation_unconfirmed")).toBe(false);
    if (tools.includes("compareOptions")) {
      const stored = (await store.load(id))!.comparison as z.output<typeof CompareOptionsOutput>;
      expect(stored.options[0]).toMatchObject({ participationSource: "rep", needsConfirmation: false });
      expect(stored.options[0].display.net).toBe(confirmed.options[0].display.net);
    }
    // It doesn't ask about the participation again.
    const asksAgain = result.reply.split("\n").some((l) => l.includes("השתתפות") && l.includes("?"));
    expect(asksAgain, result.reply).toBe(false);
  });

  it("A12: a car outside the catalog → lookup or representative, never a made-up comparison", async () => {
    const e = config.employees.employees[0];
    const deps = newDeps();
    const msg = `${openingMessage(e).replace(e.question, "")} מה יקרה לנטו אם אקח פולקסווגן ID.7 במקום הרכב הנוכחי?`;
    const turns = await chat(msg, deps, () => true);
    const t = turns[0];
    expect(t.blocked).toBe(false);
    const called = t.toolCalls.map((c) => c.toolName);
    expect(called.some((n) => ["searchValueOfUse", "getValueOfUse", "askRepresentative", "getCatalog"].includes(n))).toBe(true);
  });
});
