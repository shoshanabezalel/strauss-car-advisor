import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RepAnswerSchema, type AgentState } from "@/lib/agent";
import type { CompareOutput, ConversationStatus, ConversationStore, RepQuestionRecord, StoredMessage } from "./store";

const REP_COLUMNS = "id, conversation_id, field, question, context, status, answer, answered_by, created_at, answered_at";

interface RepQuestionRow {
  id: string;
  conversation_id: string;
  field: string;
  question: string;
  context: Record<string, unknown> | null;
  status: "open" | "answered";
  answer: unknown;
  answered_by: string | null;
  created_at: string;
  answered_at: string | null;
}

function toRecord(r: RepQuestionRow): RepQuestionRecord {
  const context = r.context ?? {};
  const answer = r.answer == null ? undefined : RepAnswerSchema.safeParse(r.answer);
  return {
    id: r.id,
    conversationId: r.conversation_id,
    field: r.field,
    carId: typeof context.carId === "string" ? context.carId : undefined,
    question: r.question,
    context,
    status: r.status,
    answer: answer?.success ? answer.data : undefined,
    answeredBy: r.answered_by ?? undefined,
    createdAt: r.created_at,
    answeredAt: r.answered_at ?? undefined,
  };
}

/** Conversations in Supabase (TECH-DESIGN §8). Uses the service-role client: server only, writes bypass RLS. */
export function createSupabaseStore(db: SupabaseClient): ConversationStore {
  const check = <T>(res: { data: T; error: { message: string } | null }, what: string): T => {
    if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
    return res.data;
  };
  const touch = async (id: string, patch: { status?: ConversationStatus } = {}) =>
    check(await db.from("conversations").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), "conversation update");

  return {
    async create(source) {
      const row = check(await db.from("conversations").insert({ source }).select("id").single(), "conversation insert");
      return (row as { id: string }).id;
    },

    async load(id) {
      const conv = check(await db.from("conversations").select("id, status").eq("id", id).maybeSingle(), "conversation select");
      if (!conv) return null;
      const [profile, messages, comparison, questions] = await Promise.all([
        db.from("profiles").select("data").eq("conversation_id", id).maybeSingle(),
        db.from("messages").select("content").eq("conversation_id", id).order("id"),
        db.from("comparisons").select("result").eq("conversation_id", id).order("id", { ascending: false }).limit(1).maybeSingle(),
        db.from("rep_questions").select(REP_COLUMNS).eq("conversation_id", id).order("created_at"),
      ]);
      const state = (check(profile, "profile select") as { data: AgentState } | null)?.data ?? { profile: {}, sources: {} };
      return {
        id,
        status: (conv as { status: ConversationStatus }).status,
        state,
        messages: (check(messages, "messages select") as { content: StoredMessage }[]).map((m) => m.content),
        comparison: (check(comparison, "comparison select") as { result: CompareOutput } | null)?.result,
        repQuestions: (check(questions, "rep questions select") as RepQuestionRow[]).map(toRecord),
      };
    },

    async appendMessages(id, messages) {
      const rows = messages.map((content) => ({ conversation_id: id, role: content.message.role, content }));
      check(await db.from("messages").insert(rows), "messages insert");
      await touch(id);
    },

    async saveState(id, state) {
      check(
        await db.from("profiles").upsert({ conversation_id: id, data: state, updated_at: new Date().toISOString() }),
        "profile upsert",
      );
    },

    async saveComparison(id, result) {
      check(await db.from("comparisons").insert({ conversation_id: id, result }), "comparison insert");
    },

    async setStatus(id, status) {
      await touch(id, { status });
    },

    repQueue(id) {
      return {
        async ask(q) {
          const row = check(
            await db
              .from("rep_questions")
              .insert({
                conversation_id: id,
                field: q.field,
                question: q.question,
                context: { ...q.context, ...(q.carId ? { carId: q.carId } : {}) },
              })
              .select("id")
              .single(),
            "rep question insert",
          );
          return { questionId: (row as { id: string }).id, status: "open" as const };
        },
      };
    },

    async listOpenRepQuestions() {
      const rows = check(await db.from("rep_questions").select(REP_COLUMNS).eq("status", "open").order("created_at"), "rep questions select");
      return (rows as RepQuestionRow[]).map(toRecord);
    },

    async getRepQuestion(id) {
      const row = check(await db.from("rep_questions").select(REP_COLUMNS).eq("id", id).maybeSingle(), "rep question select");
      return row ? toRecord(row as RepQuestionRow) : null;
    },

    async claimRepQuestion(id, answer, answeredBy) {
      // Conditional update: only one caller can move an open question to answered.
      const rows = check(
        await db
          .from("rep_questions")
          .update({ status: "answered", answer, answered_by: answeredBy ?? null, answered_at: new Date().toISOString() })
          .eq("id", id)
          .eq("status", "open")
          .select("id"),
        "rep question claim",
      );
      return (rows as unknown[]).length === 1;
    },

    async reopenRepQuestion(id) {
      check(
        await db.from("rep_questions").update({ status: "open", answer: null, answered_by: null, answered_at: null }).eq("id", id),
        "rep question reopen",
      );
    },

    async repQuestionsAnsweredSince(conversationId, since) {
      const rows = check(
        await db
          .from("rep_questions")
          .select(REP_COLUMNS)
          .eq("conversation_id", conversationId)
          .eq("status", "answered")
          .gte("answered_at", since)
          .order("answered_at"),
        "rep questions select",
      );
      return (rows as RepQuestionRow[]).map(toRecord);
    },
  };
}
