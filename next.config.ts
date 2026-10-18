import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
