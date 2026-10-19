/**
 * After `next build`: the agent's system prompt is read from disk at runtime (src/lib/agent/system-prompt.ts), so it
 * must be in the chat route's output file trace (next.config.ts outputFileTracingIncludes), or the deployed chat
 * fails on the first message. The data JSON files are imported, so the bundler includes them.
 *
 * Usage: npm run build && npm run check:build
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const PROMPT = "src/lib/agent/system-prompt.md";
const ROUTES = ["app/api/chat/route.js"];

let failed = false;
for (const route of ROUTES) {
  const trace = path.join(distDir, "server", `${route}.nft.json`);
  if (!existsSync(trace)) {
    console.log(`FAIL ${route}: no trace file at ${trace} (run \`npm run build\` first)`);
    failed = true;
    continue;
  }
  const { files } = JSON.parse(readFileSync(trace, "utf8")) as { files: string[] };
  const included = files.some((f) => path.resolve(path.dirname(trace), f) === path.resolve(PROMPT));
  console.log(`${included ? "ok  " : "FAIL"} ${route} traces ${PROMPT}`);
  if (!included) failed = true;
}
if (failed) process.exit(1);
