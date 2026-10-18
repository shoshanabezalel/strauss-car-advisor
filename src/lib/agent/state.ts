import type { EmployeeProfile } from "@/lib/engine";
import type { ProfileField, ProfileSource, RepField } from "./schemas";

/** Per-conversation state the tools read and update. The engine stays pure: tools replace `profile`, never mutate it. */
export interface AgentState {
  profile: EmployeeProfile;
  sources: Partial<Record<ProfileField, ProfileSource>>;
  /** Participation confirmed by the representative for cars other than the current one (car id → ₪). */
  repParticipation?: Record<string, number>;
}

export function createAgentState(profile: EmployeeProfile = {}): AgentState {
  return { profile, sources: {} };
}

export interface RepQuestionInput {
  question: string;
  field: RepField;
  carId?: string;
  context?: Record<string, unknown>;
}

/** Where representative questions go. Memory for tests and evals; Supabase in the app (supabase-store.ts). */
export interface RepQueue {
  ask(q: RepQuestionInput): Promise<{ questionId: string; status: "open" }>;
}

export function createMemoryRepQueue(): RepQueue & { questions: (RepQuestionInput & { questionId: string })[] } {
  const questions: (RepQuestionInput & { questionId: string })[] = [];
  return {
    questions,
    async ask(q) {
      const questionId = `q${questions.length + 1}`;
      questions.push({ ...q, questionId });
      return { questionId, status: "open" };
    },
  };
}
