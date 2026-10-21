import { expect, test } from "@playwright/test";
import catalog from "../../data/catalog.json" with { type: "json" };
import samples from "../../data/sample-employees.json" with { type: "json" };
import { loginRep } from "./helpers";

// G: the information gaps log on the rep screen (behind the access code). Mock model; gaps are recorded in code
// from the tools, plus the agent's logInformationGap in the "no data" demo prompt (used only in this spec).
const e1 = samples.employees[0];
const atto = catalog.cars.find((c) => c.id === (e1.alternative as { carId: string }).carId)!;

test.describe("information gaps", () => {
  test("the gaps API needs the rep session", async ({ request }) => {
    expect((await request.get("/api/rep/gaps")).status()).toBe(401);
    expect((await request.post("/api/rep/gaps", { data: { type: "no_data", topic: "rules", resolved: true } })).status()).toBe(401);
  });

  test("a catalog-default participation shows up as a referred_to_rep group with its car", async ({ page, context }) => {
    await page.goto("/employee");
    await page.getByTestId(`demo-${e1.id}`).click();
    await expect(page.getByTestId("notice-participation_unconfirmed")).toBeVisible();

    const rep = await context.newPage();
    await loginRep(rep);
    await rep.getByTestId("rep-tab-gaps").click();
    const group = rep.locator(`[data-testid="gap-group"][data-type="referred_to_rep"][data-topic="participation/${atto.id}"]`);
    await expect(group).toBeVisible();
    await expect(group).toContainText(atto.model);
    expect(Number(await group.getByTestId("gap-count").innerText())).toBeGreaterThanOrEqual(1);
  });

  test("'no data' answer → a no_data group; טופל persists across a reload", async ({ page, context }) => {
    await page.goto("/employee");
    await page.getByTestId("demo-no-data").click();
    await expect(page.getByTestId("msg-assistant")).toContainText("אין לי מידע");

    const rep = await context.newPage();
    await loginRep(rep);
    await rep.getByTestId("rep-tab-gaps").click();
    await expect(rep).toHaveURL(/tab=gaps/);
    const group = rep.locator('[data-testid="gap-group"][data-type="no_data"][data-topic="rules"]');
    await expect(group).toBeVisible();
    // a new occurrence reopens the group, so this run starts from open
    await expect(group).toHaveAttribute("data-resolved", "false");
    await group.getByTestId("gap-resolve").click();
    await expect(group).toHaveAttribute("data-resolved", "true");

    await rep.reload();
    await expect(rep.locator('[data-testid="gap-group"][data-type="no_data"][data-topic="rules"]')).toHaveAttribute("data-resolved", "true");
  });

  test("the gaps tab fits a phone: no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginRep(page);
    await page.getByTestId("rep-tab-gaps").click();
    await expect(page.getByTestId("gaps-panel")).toBeVisible();
    await expect(page.getByTestId("gaps-summary")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  // G add-on: summary cards, CSV export, AI analysis. Exact numbers and statuses are unit-tested (summary,
  // analysis, csv); parallel specs change how many e2e gaps exist, so this checks the wiring.
  test("summary cards, CSV export with BOM and Hebrew, and the AI analysis card", async ({ page, context }) => {
    await page.goto("/employee");
    await page.getByTestId("demo-no-data").click();
    await expect(page.getByTestId("msg-assistant")).toContainText("אין לי מידע");

    const rep = await context.newPage();
    await loginRep(rep);
    await rep.getByTestId("rep-tab-gaps").click();
    await expect(rep.getByTestId("gaps-summary")).toBeVisible();
    expect(Number(await rep.getByTestId("gaps-total-no_data").innerText())).toBeGreaterThanOrEqual(1);

    const csv = await context.request.get("/api/rep/gaps/csv");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const bytes = await csv.body();
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8").decode(bytes.subarray(3))).toMatch(/^סוג,נושא,רכב,תיאור,פניות,נראה לאחרונה,טופל\r\n/);

    await rep.getByTestId("gaps-analyze").click();
    const card = rep.getByTestId("gaps-analysis");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/[א-ת]/);
  });

  test("the add-on routes need the rep session", async ({ request }) => {
    expect((await request.get("/api/rep/gaps/csv")).status()).toBe(401);
    expect((await request.post("/api/rep/gaps/analysis")).status()).toBe(401);
  });
});
