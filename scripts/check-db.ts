/**
 * Connectivity check: every table from supabase/migrations exists and is reachable
 * with the service-role key, and readable with the publishable key (demo RLS).
 *
 * Usage: npm run check:db
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const TABLES = ["conversations", "messages", "profiles", "rep_questions", "comparisons", "value_of_use"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !service || !publishable) throw new Error("missing Supabase env vars in .env.local");

  const clients = { service: createClient(url, service), publishable: createClient(url, publishable) };
  let failed = false;
  for (const table of TABLES) {
    for (const [name, client] of Object.entries(clients)) {
      const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
      if (error) failed = true;
      console.log(`${error ? "FAIL" : "ok  "} ${table.padEnd(14)} [${name}] ${error ? error.message : `${count} rows`}`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
