import type { ModelMessage } from "ai";
import type { Notice } from "@/lib/agent";
import type { Breakdown } from "./comparison-view";
import type { StoredMessage } from "./store";

/** A chat bubble: user text, or a final (guarded) assistant reply. Tool round-trips are not shown. */
export interface VisibleMessage {
  role: "user" | "assistant";
  text: string;
  notices?: Notice[];
  blocked?: boolean;
  /** "איך זה מחושב?": the engine's lines for the comparison this reply carried. */
  breakdown?: Breakdown;
}

export function toVisibleHistory(messages: readonly StoredMessage[]): VisibleMessage[] {
  return messages.flatMap(({ message, meta }): VisibleMessage[] => {
    if (message.role === "user") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content.map((p) => (p.type === "text" ? p.text : "")).join("");
      return [{ role: "user", text }];
    }
    // Only the final reply is stored as a plain string (run-turn.ts); tool-call steps have array content.
    if (message.role === "assistant" && typeof message.content === "string") {
      return [{ role: "assistant", text: message.content, ...(meta ?? {}) }];
    }
    return [];
  });
}

type AssistantPart = Exclude<Extract<ModelMessage, { role: "assistant" }>["content"], string>[number];
type ToolPart = Extract<ModelMessage, { role: "tool" }>["content"][number];

const assistantParts = (m: Extract<ModelMessage, { role: "assistant" }>): AssistantPart[] =>
  typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;

/**
 * Model-only opening turn for a conversation that a form save started (direct-actions.ts): its history begins with
 * a tool round-trip, and Gemini rejects a function call that doesn't follow a user turn (400). Never shown or stored.
 */
const FORM_OPENING: ModelMessage = { role: "user", content: "(The employee filled in details in the form on the screen.)" };

/**
 * The history sent to the model: consecutive assistant messages, and consecutive tool messages, merged into one.
 * A representative's answer stores a tool round-trip right after the agent's reply (rep-answer.ts), and
 * @ai-sdk/google sends each assistant message as its own `model` turn. Merging keeps every part in order;
 * the stored history is not changed. A history that doesn't start with the employee gets FORM_OPENING first.
 */
export function toModelHistory(messages: readonly StoredMessage[]): ModelMessage[] {
  const out: ModelMessage[] = messages.length && messages[0].message.role !== "user" ? [FORM_OPENING] : [];
  for (const { message } of messages) {
    const last = out.at(-1);
    if (message.role === "assistant" && last?.role === "assistant") {
      out[out.length - 1] = { ...last, content: [...assistantParts(last), ...assistantParts(message)] };
    } else if (message.role === "tool" && last?.role === "tool") {
      out[out.length - 1] = { ...last, content: [...last.content, ...message.content] as ToolPart[] };
    } else {
      out.push(message);
    }
  }
  return out;
}
