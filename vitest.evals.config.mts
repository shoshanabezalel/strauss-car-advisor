import { defineConfig } from "vitest/config";

// Live LLM evals: `npm run eval:agent`. Not part of `npm test` (the Stop hook stays offline and deterministic).
// Sequential on purpose: free-tier Gemini has per-minute request limits.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/evals/**/*.eval.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 300_000,
  },
});
