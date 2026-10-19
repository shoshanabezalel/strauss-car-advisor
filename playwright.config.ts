import { defineConfig, devices } from "@playwright/test";
import { E2E_REP_CODE } from "./tests/e2e/helpers";

// Its own port and distDir, so e2e can run next to `npm run dev` (Next allows one dev server per distDir).
const PORT = 3100;
// 127.0.0.1, not localhost: the server binds to IPv4 loopback only, and localhost may resolve to ::1.
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // The dev server compiles each route on first hit, and the chat route then talks to Supabase. Since M7 every API
  // call also counts a rate-limit bucket there (~250 ms per round trip from here to Frankfurt), so the longest
  // flows (A7: two turns, rep login, answer, three reloads) need more than the default 30 s.
  timeout: 60_000,
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
        // Loopback only, so the e2e server (service-role API routes) is not reachable from the LAN.
        command: `npx next dev --hostname 127.0.0.1 --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        // Scripted model (no LLM network access needed); rows tagged for cleanup by global-teardown.
        // Polling fallback off, so the rep → employee update can only arrive through Realtime.
        // Fixed test secrets (M7); RATE_LIMIT_SCALE because every test shares 127.0.0.1.
        env: {
          APP_SECRET: "e2e-app-secret-not-for-production-0123456789",
          REP_ACCESS_CODE: E2E_REP_CODE,
          RATE_LIMIT_SCALE: "20",
          AGENT_MODEL: "mock",
          AGENT_MOCK_DELAY_MS: "400",
          CONVERSATION_SOURCE: "e2e",
          NEXT_DIST_DIR: ".next-e2e",
          NEXT_PUBLIC_REALTIME_POLL: "off",
        },
      },
});
