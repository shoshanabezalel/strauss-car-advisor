import { generateText, isStepCount, type LanguageModel, type ModelMessage } from "ai";
import type { Config } from "@/lib/config";
import type { AgentEventSink } from "./events";
import { checkNumbers, type GuardResult } from "./number-guard";
import { deriveNotices, type Notice, type ToolOutput } from "./notices";
import { loadSystemPrompt } from "./system-prompt";
import { createTools, type AgentDeps } from "./tools";

export interface AgentTurn {
  /** What the employee sees. The fallback when blocked. */
  text: string;
  blocked: boolean;
  attempts: number;
  toolCalls: { toolName: string; input: unknown }[];
  toolOutputs: ToolOutput[];
  notices: Notice[];
  guard: GuardResult;
  /** Messages to append to the conversation history (tool calls, results and the final reply). */
  responseMessages: ModelMessage[];
}

export interface RunTurnOptions {
  model: LanguageModel;
  messages: ModelMessage[];
  deps: AgentDeps;
  maxSteps?: number;
  /** Passed to the AI SDK. Evals set 0 and retry rate limits themselves. */
  maxRetries?: number;
  /** Progress (status + tool events) while the turn runs. Never carries model text. */
  onEvent?: AgentEventSink;
}

/** Shown when the reply still has an untraceable number after one regeneration. Must contain no digits. */
export const BLOCKED_REPLY =
  "סליחה, לא הצלחתי לנסח תשובה מדויקת הפעם. אפשר לשאול שוב, או שאעביר את השאלה לנציג/ת הרכב.";

const MAX_ATTEMPTS = 2;

/** Names whose digits are not numbers ("ATTO 3", "MG4"): catalog makes/models and occupations. */
export function knownNames(config: Config): string[] {
  return [
    ...config.catalog.cars.flatMap((c) => [c.make, c.model, c.modelDescription]),
    ...config.occupations.occupations.map((o) => o.name),
  ];
}

function correctionNote(guard: GuardResult, empty: boolean): string {
  if (empty) return "Your previous attempt produced no reply. Reply to the employee in Hebrew now.";
  return (
    `Your previous reply was rejected. These numbers did not come from a tool output in this turn: ${guard.invented.join(", ")}. ` +
    "Rewrite the reply: quote only numbers from tool outputs (call the tool again if needed), or leave the number out."
  );
}

/** Keep the tool round-trips of a generation, drop its prose (a rejected reply must not stay in history). */
function toolMessagesOnly(messages: ModelMessage[]): ModelMessage[] {
  return messages.flatMap((m): ModelMessage[] => {
    if (m.role !== "assistant" || typeof m.content === "string") return m.role === "assistant" ? [] : [m];
    const content = m.content.filter((p) => p.type !== "text" && p.type !== "reasoning");
    return content.length ? [{ ...m, content }] : [];
  });
}

/**
 * One employee turn: the model collects data and calls tools; the number-guard checks the final text against this
 * turn's tool outputs and the validated profile. A violation gets one regeneration; a second one blocks the reply.
 */
export async function runAgentTurn({ model, messages, deps, maxSteps = 8, maxRetries, onEvent }: RunTurnOptions): Promise<AgentTurn> {
  const system = loadSystemPrompt();
  const tools = createTools(deps, onEvent);
  const ignoreNames = knownNames(deps.config);

  const toolCalls: AgentTurn["toolCalls"] = [];
  const toolOutputs: ToolOutput[] = [];
  const carried: ModelMessage[] = [];
  let note: string | undefined;
  let guard: GuardResult = { ok: false, invented: [] };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onEvent?.({ type: "status", status: attempt === 1 ? "thinking" : "regenerating" });
    const result = await generateText({
      model,
      instructions: note ? `${system}\n\n${note}` : system,
      messages: [...messages, ...carried],
      tools,
      stopWhen: isStepCount(maxSteps),
      maxRetries,
    });
    for (const step of result.steps) {
      for (const c of step.toolCalls) toolCalls.push({ toolName: c.toolName, input: c.input });
      for (const r of step.toolResults) toolOutputs.push({ toolName: r.toolName, output: r.output });
    }
    carried.push(...toolMessagesOnly(result.steps.flatMap((s) => s.response.messages)));

    const text = result.text.trim();
    onEvent?.({ type: "status", status: "checking" });
    guard = checkNumbers(text, { toolOutputs: toolOutputs.map((o) => o.output), profile: deps.state.profile, ignoreNames });
    if (guard.ok && text) {
      return {
        text,
        blocked: false,
        attempts: attempt,
        toolCalls,
        toolOutputs,
        notices: deriveNotices(toolOutputs),
        guard,
        responseMessages: [...carried, { role: "assistant", content: text }],
      };
    }
    note = correctionNote(guard, !text);
  }

  return {
    text: BLOCKED_REPLY,
    blocked: true,
    attempts: MAX_ATTEMPTS,
    toolCalls,
    toolOutputs,
    notices: deriveNotices(toolOutputs),
    guard,
    responseMessages: [...carried, { role: "assistant", content: BLOCKED_REPLY }],
  };
}
