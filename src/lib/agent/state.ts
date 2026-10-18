import type { EmployeeProfile } from "@/lib/engine";
import type { ProfileField, ProfileSource } from "./schemas";

/** Per-conversation state the tools read and update. The engine stays pure: tools replace `profile`, never mutate it. */
export interface AgentState {
  profile: EmployeeProfile;
  sources: Partial<Record<ProfileField, ProfileSource>>;
}

export function createAgentState(profile: EmployeeProfile = {}): AgentState {
  return { profile, sources: {} };
}

export interface RepQuestionInput {
  question: string;
  field: string;
  context?: Record<string, unknown>;
}

/** Where representative questions go. Memory for tests and evals; the DB-backed queue comes with the rep screen. */
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
