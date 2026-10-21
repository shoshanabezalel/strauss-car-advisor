import { groupGaps } from "@/lib/gaps/group";
import type { GapRow, GapStatus } from "@/lib/gaps/types";
import type { ConversationSnapshot, ConversationSource, ConversationStore, RepQuestionRecord } from "./store";

/** In-memory store for unit tests. Same contract as the Supabase store. */
export function createMemoryStore(): ConversationStore {
  const rows = new Map<string, Omit<ConversationSnapshot, "repQuestions"> & { source: ConversationSource }>();
  const questions = new Map<string, RepQuestionRecord>();
  const gaps = new Map<string, GapRow>();
  const gapStatus = new Map<string, GapStatus>();
  const get = (id: string) => {
    const row = rows.get(id);
    if (!row) throw new Error(`conversation ${id} not found`);
    return row;
  };
  const byCreated = (a: RepQuestionRecord, b: RepQuestionRecord) => a.createdAt.localeCompare(b.createdAt);
  const list = (pred: (q: RepQuestionRecord) => boolean) => structuredClone([...questions.values()].filter(pred).sort(byCreated));

  return {
    async create(source, ownerHash) {
      const id = crypto.randomUUID();
      rows.set(id, { id, source, ownerHash, status: "active", state: { profile: {}, sources: {} }, messages: [] });
      return id;
    },
    async load(id) {
      const row = rows.get(id);
      if (!row) return null;
      const { id: rowId, status, state, messages, comparison, ownerHash } = structuredClone(row);
      return { id: rowId, status, state, messages, comparison, ownerHash, repQuestions: list((q) => q.conversationId === id) };
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

    async recordGaps(conversationId, list) {
      const now = new Date().toISOString();
      for (const g of list) {
        const key = `${conversationId}|${g.type}|${g.topic}`;
        const row = gaps.get(key);
        if (row) Object.assign(row, { description: g.description, vehicle: g.vehicle ?? row.vehicle, lastSeenAt: now });
        else gaps.set(key, { ...structuredClone(g), conversationId, createdAt: now, lastSeenAt: now });
      }
    },
    gapLog(conversationId) {
      return { log: (g) => this.recordGaps(conversationId, [g]) };
    },
    async listGapRows(source) {
      return structuredClone([...gaps.values()].filter((g) => rows.get(g.conversationId)?.source === source));
    },
    async listGapGroups(source) {
      const statuses = [...gapStatus.entries()].filter(([k]) => k.startsWith(`${source}|`)).map(([, s]) => s);
      return groupGaps(await this.listGapRows(source), statuses);
    },
    async setGapResolved(source, type, topic, resolved) {
      const key = `${source}|${type}|${topic}`;
      if (resolved) gapStatus.set(key, { type, topic, resolvedAt: new Date().toISOString() });
      else gapStatus.delete(key);
    },
  };
}
