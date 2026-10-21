import type { ModelMessage } from "ai";
import { checkNumbers, deriveNotices, knownNames, type AgentState, type Notice } from "@/lib/agent";
import type { ToolOutput } from "@/lib/agent/notices";
import type { Config } from "@/lib/config";
import { recordTurnGaps } from "@/lib/gaps/record";
import type { Notifier } from "@/lib/realtime/notifier";
import { breakdownOf, toComparisonView } from "./comparison-view";
import type { CompareOutput, ConversationStatus, ConversationStore } from "./store";

/**
 * A turn without the LLM: a representative's answer (rep-answer.ts) or an employee's direct edit (direct-actions.ts).
 * The tools already ran; this guards the reply built in code, then stores what an agent turn stores. That covers
 * state, comparison, the tool round-trip (hidden in the chat, seen by later agent turns) and the reply with its
 * notices. Then it pings the conversation.
 */

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface DirectTurn {
  store: ConversationStore;
  config: Config;
  notifier: Notifier;
  conversationId: string;
  /** Prefix of the synthetic tool-call ids, e.g. `rep-<questionId>` or `edit-<uuid>`. */
  callIdPrefix: string;
  state: AgentState;
  calls: ToolCallRecord[];
  compared?: CompareOutput;
  reply: string;
  /** Used when `reply` fails the number-guard (should not happen). Must contain no digits. */
  fallback: string;
  /** Validated input whose numbers may be quoted (e.g. the rep's answer). */
  extraAllowed?: unknown[];
  extraNotices?: Notice[];
  status?: ConversationStatus;
}

export async function persistDirectTurn(t: DirectTurn): Promise<{ reply: string; notices: Notice[] }> {
  const { store, config, conversationId: id, state, calls, compared } = t;
  const outputs: ToolOutput[] = calls.map(({ toolName, output }) => ({ toolName, output }));
  const callId = (i: number) => `${t.callIdPrefix}-${i}`;

  let reply = t.reply;
  const guard = checkNumbers(reply, {
    toolOutputs: [...outputs.map((o) => o.output), ...(t.extraAllowed ?? [])],
    profile: state.profile,
    ignoreNames: knownNames(config),
  });
  if (!guard.ok) {
    console.error("[direct-turn] built reply failed the number-guard", guard.invented);
    reply = t.fallback;
  }
  const notices: Notice[] = [...(t.extraNotices ?? []), ...deriveNotices(outputs)];

  const history: ModelMessage[] = calls.length
    ? [
        { role: "assistant", content: calls.map((c, i) => ({ type: "tool-call" as const, toolCallId: callId(i), toolName: c.toolName, input: c.input })) },
        {
          role: "tool",
          content: calls.map((c, i) => ({
            type: "tool-result" as const,
            toolCallId: callId(i),
            toolName: c.toolName,
            output: { type: "json" as const, value: c.output as never },
          })),
        },
      ]
    : [];

  const breakdown = compared ? breakdownOf(toComparisonView(compared, config)) : undefined;
  await store.saveState(id, state);
  if (compared) await store.saveComparison(id, compared);
  await store.appendMessages(id, [
    ...history.map((message) => ({ message })),
    { message: { role: "assistant", content: reply }, meta: { notices, blocked: false, ...(breakdown?.length ? { breakdown } : {}) } },
  ]);
  if (t.status) await store.setStatus(id, t.status);
  const ids = calls.map((c, i) => ({ ...c, toolCallId: callId(i) }));
  await recordTurnGaps(store, id, { toolCalls: ids, toolOutputs: ids }, config);
  await t.notifier.conversation(id);
  return { reply, notices };
}
