import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Kept as a file in the repo, not inline. Traced into the server build via next.config outputFileTracingIncludes. */
export const SYSTEM_PROMPT_PATH = "src/lib/agent/system-prompt.md";

let cached: string | undefined;
export function loadSystemPrompt(): string {
  return (cached ??= readFileSync(join(process.cwd(), SYSTEM_PROMPT_PATH), "utf8").trim());
}
