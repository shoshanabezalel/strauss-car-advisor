/**
 * Connectivity + RLS check: every table from supabase/migrations is reachable with the service-role key. With the
 * publishable key (M7, migration 0004) the private tables show no rows, the rate-limit function cannot be called,
 * and only value_of_use (public tax-authority data) is readable; then the value-of-use lookup against the DB
 * (needs `npm run import:vou` first).
 *
 * Usage: npm run check:db
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCatalog, getRules } from "@/lib/config";
import { createSupabaseVouSource, getValueOfUse } from "@/lib/vou";

config({ path: ".env.local", quiet: true });

/** No policy for anon / authenticated: the publishable key must see 0 rows. */
const PRIVATE = ["conversations", "messages", "profiles", "rep_questions", "comparisons", "rate_limits"];
const PUBLIC = ["value_of_use"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !service || !publishable) throw new Error("missing Supabase env vars in .env.local");

  const clients = { service: createClient(url, service), publishable: createClient(url, publishable) };
  let failed = false;
  for (const table of [...PRIVATE, ...PUBLIC]) {
    for (const [name, client] of Object.entries(clients)) {
      const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
      // A private table that the publishable key can read from is a leak, even without an error.
      const leak = name === "publishable" && PRIVATE.includes(table) && (count ?? 0) > 0;
      if (error || leak) failed = true;
      const status = error || leak ? "FAIL" : "ok  ";
      console.log(`${status} ${table.padEnd(14)} [${name}] ${error ? error.message : `${count} rows${leak ? " visible to the publishable key" : ""}`}`);
    }
  }
  const rpc = await clients.publishable.rpc("hit_rate_limit", { p_key: "check-db", p_window_seconds: 60, p_max: 1 });
  if (!rpc.error) failed = true;
  console.log(`${rpc.error ? "ok  " : "FAIL"} hit_rate_limit  [publishable] ${rpc.error ? `refused: ${rpc.error.message}` : "callable"}`);
  if (!(await checkValueOfUse(clients.publishable))) failed = true;
  if (failed) process.exit(1);
}

/** The DB lookup path (publishable key, as the app reads it): every catalog car matches; ATTO 3/TANG stays ambiguous. */
async function checkValueOfUse(client: SupabaseClient): Promise<boolean> {
  const rules = getRules();
  const source = createSupabaseVouSource(client, rules);
  let ok = true;
  const report = (pass: boolean, msg: string) => {
    if (!pass) ok = false;
    console.log(`${pass ? "ok  " : "FAIL"} ${msg}`);
  };

  for (const car of getCatalog().cars) {
    const key = { regYear: car.regYear, vehicleTypeCode: car.vehicleTypeCode, makeCode: car.makeCode, modelCode: car.modelCode };
    const res = await getValueOfUse(key, source, rules);
    const value = res.status === "found" ? res.value : res.status;
    report(value === car.valueOfUse, `vou ${car.id} ${car.model}: ${value} (catalog ${car.valueOfUse})`);
  }

  const atto = getCatalog().cars.find((c) => c.model === "ATTO 3");
  if (atto) {
    const res = await getValueOfUse({ regYear: atto.regYear, makeCode: atto.makeCode, modelCode: atto.modelCode }, source, rules);
    const names = res.status === "ambiguous" ? res.candidates.map((c) => c.tradeName).join(" / ") : res.status;
    report(res.status === "ambiguous" && res.candidates.length === 2, `vou ATTO 3 without vehicle type → ambiguous: ${names}`);
  }
  return ok;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
