/**
 * Import the tax-authority value-of-use file (cp1255 CSV) into the value_of_use table.
 * Upserts on the five-part primary key, so re-running is safe.
 *
 * Usage: npm run import:vou [-- --dry-run] [-- path/to/file.csv]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getRules } from "@/lib/config";
import { decodeCp1255, parseVouCsv, toVouRow, VOU_TABLE } from "@/lib/vou";

config({ path: ".env.local", quiet: true });

const CHUNK = 1000;
const DEFAULT_FILE = "data/raw/vou-2026.csv";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--")) ?? DEFAULT_FILE;

  const records = parseVouCsv(decodeCp1255(readFileSync(file)), getRules());
  console.log(`parsed ${records.length} rows from ${file}`);
  if (dryRun) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(url, service, { auth: { persistSession: false } });

  const rows = records.map(toVouRow);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from(VOU_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "tax_year,reg_year,vehicle_type_code,make_code,model_code" });
    if (error) throw new Error(`rows ${i}–${i + CHUNK}: ${error.message}`);
    process.stdout.write(`\rupserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");

  const taxYears = [...new Set(records.map((r) => r.taxYear))];
  const { count, error } = await db
    .from(VOU_TABLE)
    .select("*", { count: "exact", head: true })
    .in("tax_year", taxYears);
  if (error) throw new Error(error.message);
  console.log(`value_of_use rows for tax year ${taxYears.join(", ")}: ${count}`);
  if (count !== records.length) throw new Error(`expected ${records.length} rows, table has ${count}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
