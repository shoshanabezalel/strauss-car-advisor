import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentState } from "@/lib/agent";
import type { CompareOutput, ConversationStatus, ConversationStore, StoredMessage } from "./store";

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
      const [profile, messages, comparison] = await Promise.all([
        db.from("profiles").select("data").eq("conversation_id", id).maybeSingle(),
        db.from("messages").select("content").eq("conversation_id", id).order("id"),
        db.from("comparisons").select("result").eq("conversation_id", id).order("id", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const state = (check(profile, "profile select") as { data: AgentState } | null)?.data ?? { profile: {}, sources: {} };
      return {
        id,
        status: (conv as { status: ConversationStatus }).status,
        state,
        messages: (check(messages, "messages select") as { content: StoredMessage }[]).map((m) => m.content),
        comparison: (check(comparison, "comparison select") as { result: CompareOutput } | null)?.result,
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
              .insert({ conversation_id: id, field: q.field, question: q.question, context: q.context ?? {} })
              .select("id")
              .single(),
            "rep question insert",
          );
          return { questionId: (row as { id: string }).id, status: "open" as const };
        },
      };
    },
  };
}
