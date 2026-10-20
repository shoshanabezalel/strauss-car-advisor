/**
 * One real call to the configured fallback model (FALLBACK_MODEL / ANTHROPIC_API_KEY, see fallbackConfig), from
 * this machine with .env.local. The deployed suite checks the deploy's own setting via POST /api/health/fallback.
 *
 * Usage: npm run check:fallback   (or FALLBACK_MODEL=<id> npm run check:fallback)
 */
import { config } from "dotenv";
import { checkModelAnswers } from "@/lib/agent/fallback-check";
import { createFallbackOnlyModel } from "@/lib/agent/model";
import { fallbackConfig } from "@/lib/env";

config({ path: ".env.local", quiet: true });

async function main() {
  const cfg = fallbackConfig();
  if (!cfg) throw new Error("no fallback model configured: set FALLBACK_MODEL (or ANTHROPIC_API_KEY)");
  const res = await checkModelAnswers(createFallbackOnlyModel());
  console.log(`${res.ok ? "ok  " : "FAIL"} fallback ${cfg.provider} ${cfg.model} (${res.ms} ms)${res.ok ? "" : `: ${res.status ?? ""} ${res.error}`}`);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
