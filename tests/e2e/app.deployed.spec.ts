import { expect, test, type Page } from "@playwright/test";
import samples from "../../data/sample-employees.json" with { type: "json" };
import { cleanConversations } from "../../scripts/clean-e2e";
import { openingMessage } from "../../src/lib/agent/demo-messages";
import { loadConfig } from "../../src/lib/config";
import { expectLogo, loginRep } from "./helpers";

// M7 exit criterion: Playwright green on the public URL (E2E_BASE_URL; project `deployed` in playwright.config.ts).
// Live model, so only one LLM case (E-001); everything else needs no LLM. Conversations it creates are deleted by
// id afterwards (service role from .env.local), since the deploy can't tag them as e2e.
const e1 = samples.employees[0];
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const FOLLOW_UP = "כן, הכול נכון. תחשב בבקשה.";
const created: string[] = [];

const remember = (page: Page) => {
  const id = new URL(page.url()).searchParams.get("c");
  if (id) created.push(id);
  return id;
};

test.afterAll(async () => {
  const n = await cleanConversations(created);
  console.log(`[e2e deployed] deleted ${n} conversation(s)`);
});

test("home page renders in Hebrew RTL and loads the data config", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("config-status")).toContainText(/\d+/);
  await expectLogo(page);
});

test("live mode: no demo badge, and the form starts a conversation that only this browser can open", async ({ page, browser }) => {
  await page.goto("/employee");
  await expect(page.getByTestId("mock-badge")).toHaveCount(0);

  const panel = page.getByTestId("profile-panel");
  await panel.getByTestId("profile-group").selectOption(e1.profile.group);
  await panel.getByTestId("profile-save").click();
  await expect(page).toHaveURL(/\?c=[0-9a-f-]{36}$/);
  const id = remember(page)!;
  await expect(page.getByTestId("msg-assistant")).toContainText("שכר בסיס");

  const other = await browser.newContext();
  try {
    expect((await other.request.get(`/api/conversation?c=${id}`)).status()).toBe(404);
    expect((await other.request.post("/api/compare", { data: { conversationId: id, options: [{ kind: "waiver" }] } })).status()).toBe(404);
  } finally {
    await other.close();
  }
});

// Rep logins are limited to five per 15 minutes per IP. This run logs in twice (the fallback check and the gaps tab,
// which prove the login works), so this test only checks the wall.
test("the rep screen is behind the access code", async ({ page, request }) => {
  expect((await request.get("/api/rep/questions")).status()).toBe(401);
  expect((await request.get("/api/rep/gaps")).status()).toBe(401);
  await page.goto("/rep");
  await expect(page.getByTestId("rep-login")).toBeVisible();
});

// G: the information gaps tab on production: summary cards, the list (or its empty state), the CSV export.
test("the rep's information gaps tab opens with its summary and CSV export", async ({ page }) => {
  expect(process.env.E2E_REP_CODE, "set E2E_REP_CODE to the deploy's rep access code").toBeTruthy();
  await loginRep(page);
  expect((await page.context().request.get("/api/rep/questions")).status()).toBe(200);
  await page.getByTestId("rep-tab-gaps").click();
  await expect(page).toHaveURL(/tab=gaps/);
  await expect(page.getByTestId("gaps-panel")).toBeVisible();
  await expect(page.getByTestId("gaps-summary")).toBeVisible();
  await expect(page.getByTestId("gap-group").first().or(page.getByTestId("gaps-empty"))).toBeVisible();
  // the list never shows a catalog id
  expect(await page.getByTestId("gaps-panel").innerText()).not.toMatch(/CAR-\d+/);
  const csv = await page.context().request.get("/api/rep/gaps/csv");
  expect(csv.status()).toBe(200);
  expect([...(await csv.body()).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
});

// A listed model can still be unavailable (gemini-2.5-flash: 404 on 20/10). The deploy's own FALLBACK_MODEL must
// answer one real call. Needs the rep session (the endpoint costs an LLM call), so E2E_REP_CODE is required here:
// a skipped check would hide a broken fallback until the primary is busy.
test("the deploy's fallback model answers a real call", async ({ page }) => {
  expect(process.env.E2E_REP_CODE, "set E2E_REP_CODE to the deploy's rep access code").toBeTruthy();
  await loginRep(page);
  const res = await page.context().request.post("/api/health/fallback");
  const body = (await res.json()) as { ok: boolean; model?: string; error?: string; ms?: number };
  console.log(`[e2e deployed] fallback ${body.model}: ${body.ok ? `ok in ${body.ms} ms` : body.error}`);
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.ok).toBe(true);
});

test("E-001 through the live model reaches the sheet's net", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/employee");
  const input = page.getByLabel("הודעה");
  await input.fill(openingMessage(loadConfig(), loadConfig().employees.employees[0]));
  await input.press("Enter");
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1, { timeout: 120_000 });
  remember(page);

  // The model may confirm the details first (as in the evals): one follow-up.
  const net = page.getByTestId("card-option-0").getByTestId("net");
  if (!(await net.isVisible())) {
    await input.fill(FOLLOW_UP);
    await input.press("Enter");
    await expect(page.getByTestId("msg-assistant")).toHaveCount(2, { timeout: 120_000 });
  }
  await expect(net).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
  await expect(page.getByTestId("notice-participation_unconfirmed")).toBeVisible();
});
