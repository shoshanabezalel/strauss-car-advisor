import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { ASK_REP_MESSAGE, challengeOpeningMessage } from "@/lib/agent";
import { createMockModel } from "@/lib/agent/mock-model";
import { handleChatTurn, type ChatEvent } from "@/lib/chat/handle-turn";
import { toModelHistory } from "@/lib/chat/history";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { updateProfileDirect } from "@/lib/chat/direct-actions";
import { answerRepQuestion } from "@/lib/chat/rep-answer";
import type { ConversationStore } from "@/lib/chat/store";
import { loadConfig } from "@/lib/config";
import { noopNotifier } from "@/lib/realtime/notifier";
import { createMemoryVouSource } from "@/lib/vou";

// The rep-answer service stores [assistant tool-call, tool result, assistant reply] right after the agent's own
// reply. @ai-sdk/google maps each assistant message to its own `model` content without merging, so the history
// sent to Gemini must be merged first (toModelHistory). The stored history stays as it is.
const config = loadConfig();
const vouSource = createMemoryVouSource([]);
let store: ConversationStore;
beforeEach(() => {
  store = createMemoryStore();
});

async function send(text: string, conversationId?: string, model = createMockModel(config)) {
  const events: ChatEvent[] = [];
  await handleChatTurn({ store, model, config, vouSource, conversationId, text, source: "app", ownerHash: "a".repeat(64), emit: (e) => events.push(e) });
  return events.find((e) => e.type === "result") as Extract<ChatEvent, { type: "result" }>;
}

/** A7 up to the rep's reply: opening → ask the rep → rep answers. */
async function a7Answered() {
  const first = await send(challengeOpeningMessage(config));
  const id = first.conversationId;
  const asked = await send(ASK_REP_MESSAGE, id);
  const open = asked.notices.find((n) => n.kind === "rep_question_open");
  if (open?.kind !== "rep_question_open") throw new Error("no question");
  const res = await answerRepQuestion({ store, config, vouSource, notifier: noopNotifier, questionId: open.questionId, answer: config.challenge.repAnswer });
  if (!res.ok) throw new Error(res.message);
  return id;
}

const roles = (ms: readonly ModelMessage[]) => ms.map((m) => m.role);
const hasRepeats = (rs: readonly string[], role: string) => rs.some((r, i) => i > 0 && r === role && rs[i - 1] === role);

/** A Google provider whose requests are captured; it answers with a digit-free text reply. */
function capturingGemini() {
  const bodies: { contents: { role: string; parts: Record<string, unknown>[] }[] }[] = [];
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: "תודה, הבנתי." }] }, finishReason: "STOP", index: 0 }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { model: createGoogleGenerativeAI({ apiKey: "test", fetch: fetch as typeof globalThis.fetch })("gemini-3.5-flash"), bodies };
}

describe("model history after a rep answer (A7)", () => {
  it("the stored history has consecutive assistant messages, and stays unchanged", async () => {
    const id = await a7Answered();
    const stored = (await store.load(id))!.messages.map((m) => m.message);
    expect(hasRepeats(roles(stored), "assistant")).toBe(true);

    const before = structuredClone(stored);
    toModelHistory((await store.load(id))!.messages);
    expect((await store.load(id))!.messages.map((m) => m.message)).toEqual(before);
  });

  it("toModelHistory merges consecutive assistant / tool messages, keeping every part in order", async () => {
    const id = await a7Answered();
    const stored = (await store.load(id))!.messages;
    const merged = toModelHistory(stored);
    expect(hasRepeats(roles(merged), "assistant")).toBe(false);
    expect(hasRepeats(roles(merged), "tool")).toBe(false);

    // nothing lost: the same parts, in the same order
    type Part = { type: string; toolCallId?: string };
    const parts = (ms: readonly ModelMessage[]): Part[] =>
      ms.flatMap((m) => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as Part[])));
    expect(parts(merged)).toEqual(parts(stored.map((m) => m.message)));
    // every tool call is still answered by a tool result with its id
    const callIds = parts(merged).flatMap((p) => (p.type === "tool-call" ? [p.toolCallId] : []));
    const resultIds = parts(merged).flatMap((p) => (p.type === "tool-result" ? [p.toolCallId] : []));
    expect(resultIds).toEqual(callIds);
  });

  it("the employee's next turn reaches Gemini with alternating user / model contents", async () => {
    const id = await a7Answered();
    const { model, bodies } = capturingGemini();
    const res = await send("תודה! ומה אם אבחר ברכב אחר?", id, model);
    expect(res.blocked).toBe(false);

    const contents = bodies[0].contents;
    const rs = contents.map((c) => c.role);
    expect(hasRepeats(rs, "model")).toBe(false);
    expect(rs.at(-1)).toBe("user");
    // the rep's confirmed comparison is in what Gemini sees
    const sent = JSON.stringify(contents);
    expect(sent).toContain("functionCall");
    expect(sent).toContain('"participationSource":"rep"');
  });
});

// Production 22/10: a payslip save (or any form save) can start the conversation, so the stored history opens with
// [assistant tool-call, tool result, assistant reply] and no user turn. Gemini rejects a function-call turn that
// doesn't follow a user turn or a function response (400), and the next chat turn failed.
describe("model history of a conversation started by a form save", () => {
  async function savedFirst() {
    const res = await updateProfileDirect({
      store,
      config,
      vouSource,
      notifier: noopNotifier,
      source: "app",
      ownerHash: "a".repeat(64),
      updates: [{ field: "baseSalary", value: 18000 }],
    });
    if (!res.ok) throw new Error(res.message);
    return res.conversationId;
  }

  it("the stored history starts with the tool round-trip, and stays unchanged", async () => {
    const id = await savedFirst();
    const stored = (await store.load(id))!.messages.map((m) => m.message);
    expect(roles(stored)).toEqual(["assistant", "tool", "assistant"]);
    const before = structuredClone(stored);
    toModelHistory((await store.load(id))!.messages);
    expect((await store.load(id))!.messages.map((m) => m.message)).toEqual(before);
  });

  it("toModelHistory starts with a user turn, so the tool call follows one", async () => {
    const id = await savedFirst();
    const merged = toModelHistory((await store.load(id))!.messages);
    expect(roles(merged)).toEqual(["user", "assistant", "tool", "assistant"]);
  });

  it("the employee's next turn reaches Gemini with every function call after a user turn or a function response", async () => {
    const id = await savedFirst();
    const { model, bodies } = capturingGemini();
    const res = await send("מה הנטו שלי?", id, model);
    expect(res.blocked).toBe(false);

    const contents = bodies[0].contents;
    expect(contents[0].role).toBe("user");
    // Gemini sends user text and function responses both as role "user".
    contents.forEach((c, i) => {
      if (c.parts.some((p) => "functionCall" in p)) expect(contents[i - 1]?.role).toBe("user");
    });
    expect(hasRepeats(contents.map((c) => c.role), "model")).toBe(false);
  });
});
