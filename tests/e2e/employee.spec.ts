import { devices, expect, test, type Page } from "@playwright/test";
import samples from "../../data/sample-employees.json" with { type: "json" };

// Runs against the mock model (AGENT_MODEL=mock, see playwright.config.ts): the real tools and engine compute,
// the script only picks the tool calls. Expected values come from the sheet ("חישובים").
const e1 = samples.employees[0];
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

async function startE001(page: Page) {
  await page.goto("/employee");
  await expect(page.getByTestId("mock-badge")).toBeVisible();
  await page.getByTestId(`demo-${e1.id}`).click();
  // progress streams while the agent works; the reply only after the guard
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByTestId("tool-compareOptions")).toBeVisible();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(0);
  await expect(page.getByTestId("msg-assistant")).toBeVisible();
  await expect(page.getByTestId("progress")).toHaveCount(0);
  await expect(page).toHaveURL(/\?c=[0-9a-f-]{36}$/);
}

test.describe("employee screen (desktop)", () => {
  test("E-001: full run shows the comparison table and the participation notice", async ({ page }) => {
    await startE001(page);
    const reply = page.getByTestId("msg-assistant");
    await expect(reply).toContainText(fmt(e1.expected.netAlt));
    await expect(reply).toContainText("יותר מהיום");

    const table = page.getByTestId("comparison-table");
    await expect(table).toBeVisible();
    await expect(table.getByTestId("row-today").getByTestId("net")).toHaveText(`${fmt(e1.expected.netToday)} ₪`);
    await expect(table.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
    await expect(table.getByTestId("row-option-0").getByTestId("diff")).toHaveText(`עלייה של ${fmt(e1.expected.diff)} ₪`);
    await expect(table.getByTestId("row-option-0")).toContainText("ATTO 3");
    await expect(page.getByTestId("comparison-cards")).toBeHidden();

    await expect(page.getByTestId("notice-participation_unconfirmed")).toBeVisible();
    await expect(page.getByTestId("notice-participation_unconfirmed")).toContainText("ATTO 3");
  });

  test("a reload restores the conversation and the table", async ({ page }) => {
    await startE001(page);
    await page.reload();
    await expect(page.getByTestId("msg-user")).toHaveCount(1);
    await expect(page.getByTestId("msg-assistant")).toContainText(fmt(e1.expected.netAlt));
    await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
    await expect(page.getByTestId("notice-participation_unconfirmed")).toBeVisible();
  });

  test("missing data shows a missing-fields notice and no table", async ({ page }) => {
    await page.goto("/employee");
    await page.getByTestId("demo-missing").click();
    await expect(page.getByTestId("notice-missing")).toBeVisible();
    await expect(page.getByTestId("notice-missing")).toContainText("שכר בסיס");
    await expect(page.getByTestId("comparison-table")).toHaveCount(0);
  });

  test("unknown participation opens a representative question", async ({ page }) => {
    await page.goto("/employee");
    await page.getByTestId("demo-rep").click();
    await expect(page.getByTestId("notice-rep_question_open")).toBeVisible();
  });

  test("typed message goes through the same flow", async ({ page }) => {
    await page.goto("/employee");
    await page.getByLabel("הודעה").fill("מה שלומך?");
    await page.getByLabel("הודעה").press("Enter");
    await expect(page.getByTestId("msg-user")).toHaveText("מה שלומך?");
    await expect(page.getByTestId("msg-assistant")).toContainText("מצב הדגמה");
  });
});

test.describe("employee screen (mobile)", () => {
  test.use({ viewport: devices["Pixel 7"].viewport, isMobile: true, hasTouch: true });

  test("E-001 on a phone: option cards instead of the table", async ({ page }) => {
    await startE001(page);
    await expect(page.getByTestId("comparison-table")).toBeHidden();
    const cards = page.getByTestId("comparison-cards");
    await expect(cards).toBeVisible();
    await expect(cards.getByTestId("card-today").getByTestId("net")).toHaveText(`${fmt(e1.expected.netToday)} ₪`);
    await expect(cards.getByTestId("card-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
    await expect(cards.getByTestId("card-option-0").getByTestId("diff")).toHaveText(`עלייה של ${fmt(e1.expected.diff)} ₪`);
    await expect(page.getByTestId("notice-participation_unconfirmed")).toBeVisible();
    // no horizontal page scroll
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("API", () => {
  test("conversation ids must be uuids", async ({ request }) => {
    expect((await request.get("/api/conversation?c=not-a-uuid")).status()).toBe(400);
    expect((await request.get("/api/conversation?c=00000000-0000-4000-8000-000000000000")).status()).toBe(404);
    expect((await request.post("/api/chat", { data: { conversationId: "1", text: "היי" } })).status()).toBe(400);
  });
});
