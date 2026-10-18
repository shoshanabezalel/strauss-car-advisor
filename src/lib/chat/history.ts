import type { Notice } from "@/lib/agent";
import type { StoredMessage } from "./store";

/** A chat bubble: user text, or a final (guarded) assistant reply. Tool round-trips are not shown. */
export interface VisibleMessage {
  role: "user" | "assistant";
  text: string;
  notices?: Notice[];
  blocked?: boolean;
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
