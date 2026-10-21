import type { LanguageModel, ModelMessage } from "ai";
import { createAgentState, createToolHandlers, runAgentTurn, type AgentEvent, type AgentState, type Notice } from "@/lib/agent";
import { ModelBusyError } from "@/lib/agent/model-errors";
import type { Config } from "@/lib/config";
import { noopNotifier, type Notifier } from "@/lib/realtime/notifier";
import { recordTurnGaps } from "@/lib/gaps/record";
import { ownsConversation } from "@/lib/security/owner";
import type { VouSource } from "@/lib/vou";
import { toComparisonView, type ComparisonView } from "./comparison-view";
import { toModelHistory } from "./history";
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
  | { type: "error"; error: "not_found" | "failed" | "busy"; message: string };

export interface ChatTurnInput {
  store: ConversationStore;
  model: LanguageModel;
  config: Config;
  vouSource: VouSource;
  conversationId?: string;
  text: string;
  source: ConversationSource;
  /** SHA-256 of the caller's owner cookie: a conversation opens only for its owner (M7). */
  ownerHash: string;
  emit: (e: ChatEvent) => void;
  /** Pings the rep screen when a turn opens a question. */
  notifier?: Notifier;
  /** Passed to the AI SDK. The chat route sets 0: the fallback wrapper retries; the live evals retry themselves. */
  maxRetries?: number;
  /** Ends a turn that runs too long (the chat route's time budget); reported as busy. */
  abortSignal?: AbortSignal;
}

const NOT_FOUND_MESSAGE = "לא מצאתי את השיחה הזו. אפשר להתחיל שיחה חדשה.";
const FAILED_MESSAGE = "משהו השתבש ולא הצלחתי לענות. אפשר לנסות שוב בעוד רגע.";
/** Both models are rate-limited / overloaded, or the turn ran out of time. No digits. */
const BUSY_MESSAGE = "המערכת עמוסה כרגע ולא הצלחתי לענות. אפשר לנסות שוב בעוד דקה.";

const isBusy = (err: unknown) => err instanceof ModelBusyError || (err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError";

/**
 * One employee message: load (or create) the conversation, run the agent with progress events, persist the
 * turn, then emit a single `result`. Nothing is stored when the turn fails, so the employee can resend.
 */
export async function handleChatTurn(input: ChatTurnInput): Promise<void> {
  const { store, model, config, vouSource, text, source, ownerHash, emit, notifier = noopNotifier, maxRetries, abortSignal } = input;

  const loadedAt = new Date().toISOString();
  let conversationId = input.conversationId;
  const snapshot = conversationId ? await store.load(conversationId) : null;
  // Someone else's conversation looks exactly like a missing one: the response never confirms it exists.
  if (conversationId && (!snapshot || !ownsConversation(snapshot, ownerHash))) {
    emit({ type: "error", error: "not_found", message: NOT_FOUND_MESSAGE });
    return;
  }
  conversationId ??= await store.create(source, ownerHash);
  const id = conversationId;
  emit({ type: "conversation", conversationId: id });

  try {
    const state: AgentState = snapshot?.state ?? createAgentState();
    const user: ModelMessage = { role: "user", content: text };
    const history = toModelHistory(snapshot?.messages ?? []);

    const turn = await runAgentTurn({
      model,
      messages: [...history, user],
      deps: { config, vouSource, state, repQueue: store.repQueue(id), gapLog: store.gapLog(id) },
      onEvent: emit,
      maxRetries,
      abortSignal,
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
    await recordTurnGaps(store, id, turn, config);

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
    if (isBusy(err)) {
      console.warn("[chat] models busy or turn timed out", (err as Error)?.message ?? err);
      emit({ type: "error", error: "busy", message: BUSY_MESSAGE });
      return;
    }
    console.error("[chat] turn failed", err);
    emit({ type: "error", error: "failed", message: FAILED_MESSAGE });
  }
}
