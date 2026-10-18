import type { LanguageModel, ModelMessage } from "ai";
import { createAgentState, createToolHandlers, runAgentTurn, type AgentEvent, type AgentState, type Notice } from "@/lib/agent";
import type { Config } from "@/lib/config";
import { noopNotifier, type Notifier } from "@/lib/realtime/notifier";
import type { VouSource } from "@/lib/vou";
import { toComparisonView, type ComparisonView } from "./comparison-view";
import { applyRepAnswer, recompute } from "./rep-answer";
import type { CompareOutput, ConversationSource, ConversationStore } from "./store";

/** NDJSON events of POST /api/chat. Reply text only ever arrives in `result`, after the number-guard. */
export type ChatEvent =
  | AgentEvent
  | { type: "conversation"; conversationId: string }
  | {
      type: "result";
      conversationId: string;
      reply: string;
      blocked: boolean;
      notices: Notice[];
      comparison?: ComparisonView;
    }
  | { type: "error"; error: "not_found" | "failed"; message: string };

export interface ChatTurnInput {
  store: ConversationStore;
  model: LanguageModel;
  config: Config;
  vouSource: VouSource;
  conversationId?: string;
  text: string;
  source: ConversationSource;
  emit: (e: ChatEvent) => void;
  /** Pings the rep screen when a turn opens a question. */
  notifier?: Notifier;
}

const NOT_FOUND_MESSAGE = "לא מצאתי את השיחה הזו. אפשר להתחיל שיחה חדשה.";
const FAILED_MESSAGE = "משהו השתבש ולא הצלחתי לענות. אפשר לנסות שוב בעוד רגע.";

/**
 * One employee message: load (or create) the conversation, run the agent with progress events, persist the
 * turn, then emit a single `result`. Nothing is stored when the turn fails, so the employee can resend.
 */
export async function handleChatTurn(input: ChatTurnInput): Promise<void> {
  const { store, model, config, vouSource, text, source, emit, notifier = noopNotifier } = input;

  const loadedAt = new Date().toISOString();
  let conversationId = input.conversationId;
  const snapshot = conversationId ? await store.load(conversationId) : null;
  if (conversationId && !snapshot) {
    emit({ type: "error", error: "not_found", message: NOT_FOUND_MESSAGE });
    return;
  }
  conversationId ??= await store.create(source);
  const id = conversationId;
  emit({ type: "conversation", conversationId: id });

  try {
    const state: AgentState = snapshot?.state ?? createAgentState();
    const user: ModelMessage = { role: "user", content: text };
    const history = (snapshot?.messages ?? []).map((m) => m.message);

    const turn = await runAgentTurn({
      model,
      messages: [...history, user],
      deps: { config, vouSource, state, repQueue: store.repQueue(id) },
      onEvent: emit,
    });

    // A representative may have answered while the model was working: re-apply those answers so the state loaded
    // at the start doesn't overwrite them, and recompute the table with them.
    let compared = turn.toolOutputs.findLast((o) => o.toolName === "compareOptions")?.output as CompareOutput | undefined;
    const late = snapshot ? await store.repQuestionsAnsweredSince(id, loadedAt) : [];
    if (late.length) {
      const rep = createToolHandlers({ config, vouSource, state, repQueue: store.repQueue(id) }, { origin: "rep" });
      for (const q of late) if (q.answer) await applyRepAnswer(rep, state, q.answer);
      if (compared) compared = (await recompute(rep, compared)).output;
    }

    const replies = turn.responseMessages;
    const last = replies.length - 1;
    await store.appendMessages(id, [
      { message: user },
      ...replies.map((message, i) => (i === last ? { message, meta: { notices: turn.notices, blocked: turn.blocked } } : { message })),
    ]);
    await store.saveState(id, state);

    if (compared) await store.saveComparison(id, compared);
    if (turn.notices.some((n) => n.kind === "rep_question_open")) {
      await store.setStatus(id, "waiting_rep");
      await notifier.repQueue();
    }

    emit({
      type: "result",
      conversationId: id,
      reply: turn.text,
      blocked: turn.blocked,
      notices: turn.notices,
      comparison: compared ? toComparisonView(compared, config) : undefined,
    });
  } catch (err) {
    console.error("[chat] turn failed", err);
    emit({ type: "error", error: "failed", message: FAILED_MESSAGE });
  }
}
