import { createToolHandlers, type AgentState, type RepAnswer, type ToolHandlers } from "@/lib/agent";
import { REP_ANSWERED_FALLBACK, repAnsweredReply } from "@/lib/agent/replies";
import { RepFieldSchema } from "@/lib/agent/schemas";
import type { Config, Situation } from "@/lib/config";
import { maxParticipation } from "@/lib/engine";
import type { Notifier } from "@/lib/realtime/notifier";
import type { VouSource } from "@/lib/vou";
import { persistDirectTurn, type ToolCallRecord } from "./direct-turn";
import type { CompareOutput, ConversationStore } from "./store";

/**
 * A representative's answer is data, not text (TECH-DESIGN §7b): it is applied through the same tools the agent
 * uses, with origin "rep", and the engine recomputes the comparison. The employee's update is built in code from
 * the tools' display values and checked by the number-guard. No LLM call.
 */

export type RepAnswerError = "not_found" | "mismatch" | "already_answered" | "invalid" | "failed";
export type RepAnswerResult =
  | { ok: true; conversationId: string; reply: string }
  | { ok: false; error: RepAnswerError; message: string };

export interface RepAnswerInput {
  store: ConversationStore;
  config: Config;
  vouSource: VouSource;
  notifier: Notifier;
  questionId: string;
  answer: RepAnswer;
  answeredBy?: string;
}

const MESSAGES: Record<RepAnswerError, string> = {
  not_found: "השאלה לא נמצאה.",
  mismatch: "התשובה לא מתאימה לשאלה הזו.",
  already_answered: "כבר נענתה תשובה לשאלה הזו.",
  invalid: "הערך לא מוכר. אפשר לבחור מהרשימה.",
  failed: "משהו השתבש ולא הצלחתי לשמור את התשובה. אפשר לנסות שוב.",
};

const fail = (error: RepAnswerError, message = MESSAGES[error]): RepAnswerResult => ({ ok: false, error, message });

const fmt = (n: number) => n.toLocaleString("en-US");

/** A participation the rep entered must be within the car's bound (rules max and the car's monthly cost). */
function checkBound(config: Config, carId: string, value: number): string | undefined {
  const car = config.catalog.cars.find((c) => c.id === carId);
  if (!car) return MESSAGES.invalid;
  const max = maxParticipation(car, config.rules);
  return value > max ? `ההשתתפות גבוהה מהמותר לרכב הזה (עד ${fmt(max)} ₪).` : undefined;
}

function boundError(config: Config, answer: RepAnswer): string | undefined {
  if (answer.field === "participation") return checkBound(config, answer.carId, answer.value);
  if (answer.field === "current" && answer.situation.kind === "car" && answer.situation.participation !== undefined) {
    return checkBound(config, answer.situation.carId, answer.situation.participation);
  }
  return undefined;
}

export interface AppliedAnswer {
  ok: boolean;
  calls: ToolCallRecord[];
}

/** Apply one validated answer to `state` through the rep-origin tools. */
export async function applyRepAnswer(rep: ToolHandlers, state: AgentState, answer: RepAnswer): Promise<AppliedAnswer> {
  const calls: AppliedAnswer["calls"] = [];
  const update = async (input: Parameters<ToolHandlers["updateProfile"]>[0]) => {
    const output = await rep.updateProfile(input);
    calls.push({ toolName: "updateProfile", input, output });
    return { ok: output.ok, calls };
  };
  switch (answer.field) {
    case "participation": {
      const current = state.profile.current;
      if (current?.kind === "car" && current.carId === answer.carId) {
        return update({ updates: [{ field: "current", value: { kind: "car", carId: current.carId, participation: answer.value }, source: "rep" }] });
      }
      state.repParticipation = { ...state.repParticipation, [answer.carId]: answer.value };
      return { ok: true, calls };
    }
    case "current": {
      const s = answer.situation;
      const value: Situation = s.kind === "car" ? { kind: "car", carId: s.carId, participation: s.participation } : s;
      return update({ updates: [{ field: "current", value, source: "rep" }] });
    }
    case "group":
    case "occupation":
      return update({ updates: [{ field: answer.field, value: answer.value, source: "rep" }] });
  }
}

/** The last comparison's options; participations the tool supplies (catalog default / rep) are left for it to fill again. */
export function optionsForRecompute(comparison: CompareOutput): Situation[] {
  return comparison.options.map(({ situation: s }) =>
    s.kind === "car" && (s.participationSource === "catalog_default" || s.participationSource === "rep") ? { kind: "car", carId: s.carId } : s,
  );
}

export async function recompute(rep: ToolHandlers, comparison: CompareOutput) {
  const input = { options: optionsForRecompute(comparison) };
  return { input, output: await rep.compareOptions(input) };
}

export async function answerRepQuestion(input: RepAnswerInput): Promise<RepAnswerResult> {
  const { store, config, vouSource, notifier, questionId, answer, answeredBy } = input;

  const q = await store.getRepQuestion(questionId);
  if (!q) return fail("not_found");
  if (q.status !== "open") return fail("already_answered");
  const field = RepFieldSchema.safeParse(q.field);
  if (!field.success || field.data !== answer.field) return fail("mismatch");
  if (answer.field === "participation" && answer.carId !== q.carId) return fail("mismatch");
  const bound = boundError(config, answer);
  if (bound) return fail("invalid", bound);

  if (!(await store.claimRepQuestion(questionId, answer, answeredBy))) return fail("already_answered");

  const id = q.conversationId;
  try {
    const snap = await store.load(id);
    if (!snap) throw new Error(`conversation ${id} not found`);
    const state = snap.state;
    const rep = createToolHandlers({ config, vouSource, state, repQueue: store.repQueue(id) }, { origin: "rep" });

    const applied = await applyRepAnswer(rep, state, answer);
    if (!applied.ok) {
      await store.reopenRepQuestion(questionId);
      return fail("invalid");
    }
    const calls = [...applied.calls];
    let compared: CompareOutput | undefined;
    if (snap.comparison) {
      const { input: compareInput, output } = await recompute(rep, snap.comparison);
      compared = output;
      calls.push({ toolName: "compareOptions", input: compareInput, output });
    }

    const stillOpen = snap.repQuestions.some((r) => r.id !== questionId && r.status === "open");
    const { reply } = await persistDirectTurn({
      store,
      config,
      notifier,
      conversationId: id,
      callIdPrefix: `rep-${questionId}`,
      state,
      calls,
      compared,
      reply: repAnsweredReply({ answer, compare: compared, config }),
      fallback: REP_ANSWERED_FALLBACK,
      extraAllowed: [answer],
      extraNotices: [{ kind: "rep_answered", questionId, field: answer.field }],
      status: stillOpen ? "waiting_rep" : "active",
    });
    await notifier.repQueue();
    return { ok: true, conversationId: id, reply };
  } catch (err) {
    console.error("[rep] answer failed", err);
    await store.reopenRepQuestion(questionId).catch((e) => console.error("[rep] reopen failed", e));
    return fail("failed");
  }
}
