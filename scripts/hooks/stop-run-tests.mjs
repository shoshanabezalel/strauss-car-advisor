/**
 * Claude Code Stop hook: runs `npm test` when Claude finishes a turn.
 * Red tests → exit 2 with the output on stderr, which blocks the stop and hands the failure back to Claude.
 * If this stop was itself caused by the hook (stop_hook_active), let it through to avoid a loop.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // No/invalid stdin — still run the tests.
}
if (input.stop_hook_active) process.exit(0);

const result = spawnSync("npm", ["test", "--silent"], {
  cwd: input.cwd || process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32", // npm is npm.cmd on Windows
});

if (result.status === 0) process.exit(0);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-60).join("\n");
console.error(`Stop hook: \`npm test\` failed — fix before finishing.\n${output}`);
process.exit(2);
