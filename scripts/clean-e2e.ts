/**
 * Delete conversations created by e2e runs (source = 'e2e'). Messages, profiles, rep questions, comparisons and
 * information gaps go with them (on delete cascade); the e2e "טופל" status rows are deleted too (they belong to
 * no conversation). Also run by Playwright's global teardown.
 *
 * Usage: npm run db:clean-e2e
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

function serviceClient() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("missing Supabase env vars in .env.local");
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function cleanE2e(): Promise<number> {
  const db = serviceClient();
  const { data, error } = await db.from("conversations").delete().eq("source", "e2e").select("id");
  if (error) throw new Error(`cleanup failed: ${error.message}`);
  const status = await db.from("information_gap_status").delete().eq("source", "e2e");
  if (status.error) throw new Error(`gap status cleanup failed: ${status.error.message}`);
  return data.length;
}

/** The deployed suite can't tag rows (the deploy has no CONVERSATION_SOURCE), so it deletes what it created by id. */
export async function cleanConversations(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await serviceClient().from("conversations").delete().in("id", ids).select("id");
  if (error) throw new Error(`cleanup failed: ${error.message}`);
  return data.length;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/clean-e2e.ts")) {
  cleanE2e()
    .then((n) => console.log(`deleted ${n} e2e conversation(s)`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
