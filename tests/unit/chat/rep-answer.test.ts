import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { ASK_REP_MESSAGE, challengeOpeningMessage, checkNumbers, knownNames, UNKNOWN_PARTICIPATION_MESSAGE, type RepAnswer } from "@/lib/agent";
import { createMockModel } from "@/lib/agent/mock-model";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { toVisibleHistory } from "@/lib/chat/history";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { answerRepQuestion } from "@/lib/chat/rep-answer";
import { loadConfig } from "@/lib/config";
import { compareOptions, maxParticipation } from "@/lib/engine";
import { roundShekel } from "@/lib/format/money";
import { createMemoryNotifier } from "@/lib/realtime/notifier";
import { conversationTopic } from "@/lib/realtime/conversation-topic";
import { REP_QUEUE_TOPIC } from "@/lib/realtime/topics";
import { createMemoryVouSource } from "@/lib/vou";

const config = loadConfig();
const a7 = config.challenge;
const answer = a7.repAnswer as Extract<RepAnswer, { field: "participation" }>;
const vouSource = createMemoryVouSource([]);
const SECRET = "s".repeat(40);
let store: ReturnType<typeof createMemoryStore>;
let notifier: ReturnType<typeof createMemoryNotifier>;
beforeEach(() => {
  store = createMemoryStore();
  notifier = createMemoryNotifier(SECRET);
});

async function send(text: string, conversationId?: string, model: LanguageModel = createMockModel(config)) {
  const events: ChatEvent[] = [];
  await handleChatTurn({ store, model, config, vouSource, notifier, conversationId, text, source: "app", ownerHash: "a".repeat(64), emit: (e) => events.push(e) });
  return events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
}

/** A7 up to the open question: opening message (catalog default) → "ask the representative". */
async function a7WaitingForRep() {
  const first = await send(challengeOpeningMessage(config));
  const id = first.conversationId;
  const second = await send(ASK_REP_MESSAGE, id);
  const open = second.notices.find((n) => n.kind === "rep_question_open");
  if (!open || open.kind !== "rep_question_open") throw new Error("no rep question opened");
  return { id, questionId: open.questionId, first };
}

const answerQ = (questionId: string, a: RepAnswer = answer, answeredBy?: string) =>
  answerRepQuestion({ store, config, vouSource, notifier, questionId, answer: a, answeredBy });

describe("A7: representative answers the participation", () => {
  it("the question is structured, the conversation waits, and the rep queue is pinged", async () => {
    const { id, questionId } = await a7WaitingForRep();
    const q = (await store.getRepQuestion(questionId))!;
    expect(q).toMatchObject({ conversationId: id, field: "participation", carId: answer.carId, status: "open" });
    expect((await store.load(id))!.status).toBe("waiting_rep");
    expect(notifier.calls).toContain(REP_QUEUE_TOPIC);
    expect(await store.listOpenRepQuestions()).toHaveLength(1);
  });

  it("the answer goes through the tools: the engine recomputes with source rep", async () => {
    const { id, questionId, first } = await a7WaitingForRep();
    expect(first.comparison?.rows[1].needsConfirmation).toBe(true);

    const res = await answerQ(questionId, answer, "דנה");
    expect(res.ok).toBe(true);

    const snap = (await store.load(id))!;
    const opt = snap.comparison!.options[0];
    const engine = compareOptions(
      a7.profile,
      [{ kind: "car", carId: answer.carId, participation: answer.value, participationSource: "rep" }],
      config,
    );
    expect(opt).toMatchObject({ participation: answer.value, participationSource: "rep", needsConfirmation: false });
    expect(opt.breakdown?.net).toBe(engine.options[0].breakdown?.net);
    expect(opt.display.net).toBe(roundShekel(engine.options[0].breakdown!.net));
    expect(snap.state.repParticipation).toEqual({ [answer.carId]: answer.value });

    // the question is closed with the validated answer, the conversation is active again
    expect(await store.getRepQuestion(questionId)).toMatchObject({ status: "answered", answer, answeredBy: "דנה" });
    expect(snap.status).toBe("active");
    expect(await store.listOpenRepQuestions()).toHaveLength(0);
    expect(notifier.calls).toEqual(expect.arrayContaining([conversationTopic(id, SECRET), REP_QUEUE_TOPIC]));
  });

  it("the employee sees a deterministic reply whose numbers all come from the tools", async () => {
    const { id, questionId } = await a7WaitingForRep();
    const res = await answerQ(questionId);
    if (!res.ok) throw new Error(res.message);

    const snap = (await store.load(id))!;
    const visible = toVisibleHistory(snap.messages);
    const last = visible.at(-1)!;
    expect(last.role).toBe("assistant");
    expect(last.text).toBe(res.reply);
    expect(last.notices).toContainEqual({ kind: "rep_answered", questionId, field: "participation" });
    expect(last.notices?.some((n) => n.kind === "participation_unconfirmed")).toBe(false);

    const opt = snap.comparison!.options[0];
    expect(res.reply).toContain(answer.value.toLocaleString("en-US"));
    expect(res.reply).toContain(opt.display.net!.toLocaleString("en-US"));
    const guard = checkNumbers(res.reply, { toolOutputs: [snap.comparison], profile: snap.state.profile, ignoreNames: knownNames(config) });
    expect(guard).toEqual({ ok: true, invented: [] });
    // the tool round-trip is in the model history, hidden from the chat
    expect(snap.messages.some((m) => m.message.role === "tool")).toBe(true);
    expect(visible.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "assistant"]);
  });

  it("the confirmed participation survives a later agent turn", async () => {
    const { id, questionId } = await a7WaitingForRep();
    await answerQ(questionId);
    const again = await send(challengeOpeningMessage(config), id);
    const row = again.comparison!.rows[1];
    expect(row).toMatchObject({ participationSource: "rep", needsConfirmation: false });
    expect(row.amounts.participation).toBe(answer.value);
  });
});

describe("answer validation", () => {
  it("unknown question → not_found", async () => {
    expect(await answerQ(crypto.randomUUID())).toMatchObject({ ok: false, error: "not_found" });
  });

  it("a second answer → already_answered, nothing applied twice", async () => {
    const { id, questionId } = await a7WaitingForRep();
    await answerQ(questionId);
    const before = (await store.load(id))!.messages.length;
    expect(await answerQ(questionId, { ...answer, value: answer.value + 1 })).toMatchObject({ ok: false, error: "already_answered" });
    const snap = (await store.load(id))!;
    expect(snap.messages).toHaveLength(before);
    expect(snap.comparison!.options[0].participation).toBe(answer.value);
  });

  it("an answer for another field or car → mismatch, question stays open", async () => {
    const { questionId } = await a7WaitingForRep();
    const other = config.catalog.cars.find((c) => c.id !== answer.carId)!;
    expect(await answerQ(questionId, { field: "group", value: "ג" })).toMatchObject({ ok: false, error: "mismatch" });
    expect(await answerQ(questionId, { ...answer, carId: other.id })).toMatchObject({ ok: false, error: "mismatch" });
    expect((await store.getRepQuestion(questionId))!.status).toBe("open");
  });

  it("above the participation bound → invalid with a Hebrew message; the bound itself is accepted", async () => {
    const { questionId } = await a7WaitingForRep();
    const car = config.catalog.cars.find((c) => c.id === answer.carId)!;
    const max = maxParticipation(car, config.rules);
    const res = await answerQ(questionId, { ...answer, value: max + 1 });
    expect(res).toMatchObject({ ok: false, error: "invalid" });
    if (!res.ok) {
      expect(res.message).toMatch(/[֐-׿]/);
      expect(res.message).toContain(max.toLocaleString("en-US"));
    }
    expect((await store.getRepQuestion(questionId))!.status).toBe("open");
    expect(await answerQ(questionId, { ...answer, value: max })).toMatchObject({ ok: true });
  });

  it("a value the tools reject releases the claim", async () => {
    const res = await send(UNKNOWN_PARTICIPATION_MESSAGE);
    const open = res.notices.find((n) => n.kind === "rep_question_open")!;
    const questionId = open.kind === "rep_question_open" ? open.questionId : "";
    const r = await answerQ(questionId, { field: "current", situation: { kind: "car", carId: "CAR-99", participation: 100 } });
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect((await store.getRepQuestion(questionId))!.status).toBe("open");
  });

  it("a failure after the claim re-opens the question", async () => {
    const { questionId } = await a7WaitingForRep();
    const saveState = store.saveState;
    store.saveState = async () => {
      throw new Error("db down");
    };
    expect(await answerQ(questionId)).toMatchObject({ ok: false, error: "failed" });
    store.saveState = saveState;
    expect((await store.getRepQuestion(questionId))!.status).toBe("open");
    expect(await answerQ(questionId)).toMatchObject({ ok: true });
  });
});

describe("other answer kinds", () => {
  it("current car from the rep (A12): updateProfile with source rep", async () => {
    const res = await send(UNKNOWN_PARTICIPATION_MESSAGE);
    const open = res.notices.find((n) => n.kind === "rep_question_open")!;
    const questionId = open.kind === "rep_question_open" ? open.questionId : "";
    expect((await store.getRepQuestion(questionId))!.field).toBe("current");
    const car = config.catalog.cars[0];
    const r = await answerQ(questionId, { field: "current", situation: { kind: "car", carId: car.id, participation: car.defaultParticipation } });
    expect(r.ok).toBe(true);
    const snap = (await store.load(res.conversationId))!;
    expect(snap.state.sources.current).toBe("rep");
    expect(snap.state.profile.current).toMatchObject({ carId: car.id, participationSource: "rep" });
    // no comparison yet → no table, but a reply that needs no number from the rep
    expect(snap.comparison).toBeUndefined();
  });
});

describe("race with a running employee turn", () => {
  it("a rep answer that lands mid-turn is not overwritten by the turn's stale state", async () => {
    const { id, questionId } = await a7WaitingForRep();
    const mock = createMockModel(config) as unknown as { doGenerate: (o: unknown) => Promise<unknown> };
    let answered = false;
    const racing = new Proxy(mock, {
      get(target, prop, receiver) {
        if (prop !== "doGenerate") return Reflect.get(target, prop, receiver);
        return async (o: unknown) => {
          if (!answered) {
            answered = true;
            await answerQ(questionId);
          }
          return target.doGenerate(o);
        };
      },
    });
    const result = await send(challengeOpeningMessage(config), id, racing as unknown as LanguageModel);
    expect(answered).toBe(true);
    const snap = (await store.load(id))!;
    expect(snap.state.repParticipation).toEqual({ [answer.carId]: answer.value });
    expect(snap.comparison!.options[0]).toMatchObject({ participationSource: "rep", participation: answer.value });
    expect(result.comparison!.rows[1].participationSource).toBe("rep");
  });
});
