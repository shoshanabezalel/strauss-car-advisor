import { expect, test } from "@playwright/test";
import { expectLogo } from "./helpers";

test("home page renders in Hebrew RTL and loads the data config", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Proves data/*.json parsed through Zod on the server.
  await expect(page.getByTestId("config-status")).toContainText(/\d+/);
});

test("the logo is the original file on the home page and the employee screen", async ({ page }) => {
  await page.goto("/");
  await expectLogo(page);
  await page.goto("/employee");
  await expectLogo(page);
});
