/**
 * Launches the Supabase MCP server over stdio with SUPABASE_ACCESS_TOKEN read from .env.local,
 * so .mcp.json holds no secrets. All CLI args are forwarded (e.g. --project-ref, --features).
 *
 * Why stdio: the hosted HTTP endpoint's OAuth fails in Claude Code with
 * "Resource must be a valid MCP endpoint" when the URL carries ?project_ref.
 *
 * Why a local devDependency instead of `npx -y`: npx checks the registry on every launch (7–8 s here, more on a
 * cold cache), which pushed startup past Claude Code's 30 s MCP timeout. The local binary starts in ~2 s offline.
 *
 * stdout is the MCP channel — never write to it from here; diagnostics go to stderr.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const SERVER_PACKAGE = "@supabase/mcp-server-supabase"; // pinned in package.json devDependencies

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The package doesn't export ./package.json, so read it from node_modules directly.
const pkgDir = join(root, "node_modules", SERVER_PACKAGE);
const { bin } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const cli = join(pkgDir, typeof bin === "string" ? bin : bin["mcp-server-supabase"]);
config({ path: join(root, ".env.local"), quiet: true });

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("supabase-mcp: SUPABASE_ACCESS_TOKEN is missing from .env.local (create one at https://supabase.com/dashboard/account/tokens)");
  process.exit(1);
}

// Token goes via env, not argv, so it doesn't show up in process listings.
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (err) => {
  console.error(`supabase-mcp: failed to start ${SERVER_PACKAGE}: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
