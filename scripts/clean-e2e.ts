/**
 * Delete conversations created by e2e runs (source = 'e2e'). Messages, profiles, rep questions and comparisons
 * go with them (on delete cascade). Also run by Playwright's global teardown.
 *
 * Usage: npm run db:clean-e2e
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

export async function cleanE2e(): Promise<number> {
  config({ path: ".env.local", quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("missing Supabase env vars in .env.local");

  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await db.from("conversations").delete().eq("source", "e2e").select("id");
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
