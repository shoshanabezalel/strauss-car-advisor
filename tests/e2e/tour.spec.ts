import { expect, test, type Page } from "@playwright/test";
import { EMPLOYEE_TOUR, REP_TOUR } from "../../src/lib/tour/steps";
import { loginRep } from "./helpers";

// F7: the onboarding tour (docs/TOUR.md). Every other spec starts with the tour seen (playwright.config.ts);
// these start from empty storage, like a first visit.
test.use({ storageState: { cookies: [], origins: [] } });

const tour = (page: Page) => page.getByTestId("tour");
const help = (page: Page) => page.locator('[data-tour="tour-help"]');

/** React has hydrated the "?" button and had two frames to start a first-visit tour, so "no tour" is a real answer. */
async function settled(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-tour="tour-help"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function expectStep(page: Page, id: string, text: string, n: number, of: number) {
  await expect(tour(page)).toHaveAttribute("data-step", id);
  await expect(page.getByTestId("tour-text")).toHaveText(text);
  await expect(tour(page)).toContainText(`${n} מתוך ${of}`);
  await expect(page.getByTestId("tour-next")).toBeFocused();
}

test.describe("employee tour", () => {
  test("appears on the first visit, can be skipped, doesn't reappear, and ? restarts it", async ({ page }) => {
    await page.goto("/employee");
    await expectStep(page, "welcome", EMPLOYEE_TOUR[0].text, 1, 7);
    await page.getByTestId("tour-next").click();
    await expectStep(page, "chat-input", EMPLOYEE_TOUR[1].text, 2, 7);

    await page.getByTestId("tour-skip").click();
    await expect(tour(page)).toHaveCount(0);

    await page.reload();
    await settled(page);
    await expect(tour(page)).toHaveCount(0);

    await help(page).click();
    await expectStep(page, "welcome", EMPLOYEE_TOUR[0].text, 1, 7);
  });

  test("a missing target gets the centered fallback; Esc closes; the last step points at ? and returns focus to it", async ({ page }) => {
    await page.goto("/employee");
    await expect(tour(page)).toBeVisible();
    // Step 5: no option picker before the profile is complete.
    for (let i = 0; i < 4; i++) await page.getByTestId("tour-next").click();
    await expect(tour(page)).toHaveAttribute("data-step", "options");
    await expect(tour(page)).toHaveAttribute("data-centered", "true");
    await expect(page.getByTestId("tour-text")).toHaveText(EMPLOYEE_TOUR[4].fallback!);

    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);

    await help(page).click();
    for (let i = 0; i < 6; i++) await page.getByTestId("tour-next").click();
    await expectStep(page, "help", EMPLOYEE_TOUR[6].text, 7, 7);
    await expect(tour(page)).toHaveAttribute("data-centered", "false");
    await expect(page.getByTestId("tour-next")).toHaveText("סיום");
    await page.getByTestId("tour-next").click();
    await expect(tour(page)).toHaveCount(0);
    await expect(help(page)).toBeFocused();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("the profile step points at the toggle and the bubble stays inside the gutter", async ({ page }) => {
      await page.goto("/employee");
      await expect(tour(page)).toBeVisible();
      for (let i = 0; i < 3; i++) await page.getByTestId("tour-next").click();
      await expect(tour(page)).toHaveAttribute("data-step", "profile");
      await expect(tour(page)).toHaveAttribute("data-centered", "false");
      const box = (await tour(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(16);
      expect(box.x + box.width).toBeLessThanOrEqual(375 - 16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  });
});

test.describe("rep tour", () => {
  test("appears after login, can be skipped, doesn't reappear, and ? restarts it", async ({ page }) => {
    await loginRep(page);
    await expectStep(page, "welcome", REP_TOUR[0].text, 1, 6);

    await page.getByTestId("tour-skip").click();
    await expect(tour(page)).toHaveCount(0);

    await page.reload();
    await settled(page);
    await expect(tour(page)).toHaveCount(0);

    await help(page).click();
    await expectStep(page, "welcome", REP_TOUR[0].text, 1, 6);
  });
});
