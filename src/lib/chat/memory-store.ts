import type { ConversationSnapshot, ConversationSource, ConversationStore, RepQuestionRecord } from "./store";

/** In-memory store for unit tests. Same contract as the Supabase store. */
export function createMemoryStore(): ConversationStore {
  const rows = new Map<string, Omit<ConversationSnapshot, "repQuestions"> & { source: ConversationSource }>();
  const questions = new Map<string, RepQuestionRecord>();
  const get = (id: string) => {
    const row = rows.get(id);
    if (!row) throw new Error(`conversation ${id} not found`);
    return row;
  };
  const byCreated = (a: RepQuestionRecord, b: RepQuestionRecord) => a.createdAt.localeCompare(b.createdAt);
  const list = (pred: (q: RepQuestionRecord) => boolean) => structuredClone([...questions.values()].filter(pred).sort(byCreated));

  return {
    async create(source) {
      const id = crypto.randomUUID();
      rows.set(id, { id, source, status: "active", state: { profile: {}, sources: {} }, messages: [] });
      return id;
    },
    async load(id) {
      const row = rows.get(id);
      if (!row) return null;
      const { id: rowId, status, state, messages, comparison } = structuredClone(row);
      return { id: rowId, status, state, messages, comparison, repQuestions: list((q) => q.conversationId === id) };
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
          get(id);
          const questionId = crypto.randomUUID();
          questions.set(questionId, {
            id: questionId,
            conversationId: id,
            field: q.field,
            carId: q.carId,
            question: q.question,
            context: { ...q.context, ...(q.carId ? { carId: q.carId } : {}) },
            status: "open",
            createdAt: new Date().toISOString(),
          });
          return { questionId, status: "open" as const };
        },
      };
    },
    async listOpenRepQuestions() {
      return list((q) => q.status === "open");
    },
    async getRepQuestion(id) {
      const q = questions.get(id);
      return q ? structuredClone(q) : null;
    },
    async claimRepQuestion(id, answer, answeredBy) {
      const q = questions.get(id);
      if (!q || q.status !== "open") return false;
      Object.assign(q, { status: "answered", answer: structuredClone(answer), answeredBy, answeredAt: new Date().toISOString() });
      return true;
    },
    async reopenRepQuestion(id) {
      const q = questions.get(id);
      if (!q) return;
      q.status = "open";
      delete q.answer;
      delete q.answeredBy;
      delete q.answeredAt;
    },
    async repQuestionsAnsweredSince(conversationId, since) {
      return list((q) => q.conversationId === conversationId && q.status === "answered" && (q.answeredAt ?? "") >= since);
    },
  };
}
