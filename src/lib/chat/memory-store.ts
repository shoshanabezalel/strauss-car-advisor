import type { RepQuestionInput } from "@/lib/agent";
import type { ConversationSnapshot, ConversationSource, ConversationStore } from "./store";

/** In-memory store for unit tests. Same contract as the Supabase store. */
export function createMemoryStore(): ConversationStore & { questions: Map<string, (RepQuestionInput & { questionId: string })[]> } {
  const rows = new Map<string, ConversationSnapshot & { source: ConversationSource }>();
  const questions = new Map<string, (RepQuestionInput & { questionId: string })[]>();
  const get = (id: string) => {
    const row = rows.get(id);
    if (!row) throw new Error(`conversation ${id} not found`);
    return row;
  };

  return {
    questions,
    async create(source) {
      const id = crypto.randomUUID();
      rows.set(id, { id, source, status: "active", state: { profile: {}, sources: {} }, messages: [] });
      return id;
    },
    async load(id) {
      const row = rows.get(id);
      return row ? structuredClone({ id: row.id, status: row.status, state: row.state, messages: row.messages, comparison: row.comparison }) : null;
    },
    async appendMessages(id, messages) {
      get(id).messages.push(...structuredClone(messages));
    },
    async saveState(id, state) {
      get(id).state = structuredClone(state);
    },
    async saveComparison(id, result) {
      get(id).comparison = structuredClone(result);
    },
    async setStatus(id, status) {
      get(id).status = status;
    },
    repQueue(id) {
      return {
        async ask(q) {
          const list = questions.get(id) ?? [];
          const questionId = crypto.randomUUID();
          list.push({ ...q, questionId });
          questions.set(id, list);
          return { questionId, status: "open" as const };
        },
      };
    },
  };
}
