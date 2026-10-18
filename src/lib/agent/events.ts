import type { ToolName } from "./tools";

/**
 * Progress events emitted while a turn runs. None of them carries model text: the reply is only released
 * after the number-guard passes (see run-turn.ts).
 */
export type AgentEvent =
  | { type: "status"; status: "thinking" | "checking" | "regenerating" }
  | { type: "tool"; name: ToolName; state: "running" | "done" | "error" };

export type AgentEventSink = (e: AgentEvent) => void;
