import type { ModelMessage } from "ai";
import type { z } from "zod";
import type { AgentState, Notice, RepQueue } from "@/lib/agent";
import type { CompareOptionsOutput } from "@/lib/agent/schemas";

export const CONVERSATION_SOURCES = ["app", "e2e"] as const;
export type ConversationSource = (typeof CONVERSATION_SOURCES)[number];
export type ConversationStatus = "active" | "waiting_rep" | "done";
export type CompareOutput = z.output<typeof CompareOptionsOutput>;

/** One row of `messages.content`: the model message plus, on a final reply, what the UI shows next to it. */
export interface StoredMessage {
  message: ModelMessage;
  meta?: { notices: Notice[]; blocked: boolean };
}

export interface ConversationSnapshot {
  id: string;
  status: ConversationStatus;
  state: AgentState;
  messages: StoredMessage[];
  /** The latest compareOptions output, if any. */
  comparison?: CompareOutput;
}

/** Where conversations live. Supabase in the app (service role), memory in unit tests. */
export interface ConversationStore {
  create(source: ConversationSource): Promise<string>;
  /** null when no conversation has this id. */
  load(id: string): Promise<ConversationSnapshot | null>;
  appendMessages(id: string, messages: StoredMessage[]): Promise<void>;
  saveState(id: string, state: AgentState): Promise<void>;
  saveComparison(id: string, result: CompareOutput): Promise<void>;
  setStatus(id: string, status: ConversationStatus): Promise<void>;
  repQueue(id: string): RepQueue;
}
