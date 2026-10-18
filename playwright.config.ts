import { defineConfig, devices } from "@playwright/test";

// Its own port and distDir, so e2e can run next to `npm run dev` (Next allows one dev server per distDir).
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // The dev server compiles each route on first hit, and the chat route then talks to Supabase.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    locale: "he-IL",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Against a deployed URL (M7) set E2E_BASE_URL and no local server is started.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        // Scripted model (no LLM network access needed); rows tagged for cleanup by global-teardown.
        // Polling fallback off, so the rep → employee update can only arrive through Realtime.
        env: {
          AGENT_MODEL: "mock",
          AGENT_MOCK_DELAY_MS: "400",
          CONVERSATION_SOURCE: "e2e",
          NEXT_DIST_DIR: ".next-e2e",
          NEXT_PUBLIC_REALTIME_POLL: "off",
        },
      },
});
