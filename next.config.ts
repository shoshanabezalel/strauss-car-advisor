import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // e2e runs its own `next dev` (port 3100, mock model) next to a regular dev server; Next allows one per distDir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The agent's system prompt is read from disk at runtime (src/lib/agent/system-prompt.ts).
  outputFileTracingIncludes: { "/**": ["./src/lib/agent/system-prompt.md"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
