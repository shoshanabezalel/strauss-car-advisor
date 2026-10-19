import type { ModelMessage } from "ai";
import type { z } from "zod";
import type { AgentState, Notice, RepAnswer, RepQueue } from "@/lib/agent";
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

export type RepQuestionStatus = "open" | "answered";

/** One row of `rep_questions`. `field` is a RepField for questions since M5 (older rows may hold free text). */
export interface RepQuestionRecord {
  id: string;
  conversationId: string;
  field: string;
  /** The car a participation question is about (stored in `context.carId`). */
  carId?: string;
  question: string;
  context: Record<string, unknown>;
  status: RepQuestionStatus;
  /** The validated answer (RepAnswerSchema), once answered. */
  answer?: RepAnswer;
  answeredBy?: string;
  createdAt: string;
  answeredAt?: string;
}

export interface ConversationSnapshot {
  id: string;
  status: ConversationStatus;
  state: AgentState;
  messages: StoredMessage[];
  /** The latest compareOptions output, if any. */
  comparison?: CompareOutput;
  /** This conversation's representative questions, oldest first. */
  repQuestions: RepQuestionRecord[];
  /** SHA-256 of the creator's owner cookie (M7). Undefined for conversations created before M7: nobody owns them. */
  ownerHash?: string;
}

/** Where conversations live. Supabase in the app (service role), memory in unit tests. */
export interface ConversationStore {
  create(source: ConversationSource, ownerHash?: string): Promise<string>;
  /** null when no conversation has this id. */
  load(id: string): Promise<ConversationSnapshot | null>;
  appendMessages(id: string, messages: StoredMessage[]): Promise<void>;
  saveState(id: string, state: AgentState): Promise<void>;
  saveComparison(id: string, result: CompareOutput): Promise<void>;
  setStatus(id: string, status: ConversationStatus): Promise<void>;
  repQueue(id: string): RepQueue;

  /** Open questions of every conversation, oldest first (the rep screen). */
  listOpenRepQuestions(): Promise<RepQuestionRecord[]>;
  getRepQuestion(id: string): Promise<RepQuestionRecord | null>;
  /** open → answered with the answer, atomically. false when it was not open (already answered or unknown). */
  claimRepQuestion(id: string, answer: RepAnswer, answeredBy?: string): Promise<boolean>;
  /** answered → open, clearing the answer (undo a claim whose apply step failed). */
  reopenRepQuestion(id: string): Promise<void>;
  /** This conversation's questions answered at or after `since` (ISO time). */
  repQuestionsAnsweredSince(conversationId: string, since: string): Promise<RepQuestionRecord[]>;
}
