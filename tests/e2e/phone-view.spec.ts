import { expect, test } from "@playwright/test";

// User 22/10: the home screen offers a phone view: the real app in a ~390×844 frame, through an iframe of the
// same origin, so the phone breakpoints apply inside it. Nothing changes inside the app.
test("the phone view shows the app in a phone-sized frame, and links back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "תצוגת טלפון" }).click();
  await expect(page).toHaveURL(/\/phone$/);

  const frame = page.getByTestId("phone-frame");
  await expect(frame).toHaveAttribute("src", "/");
  const box = (await frame.boundingBox())!;
  expect(Math.round(box.width)).toBe(390);
  // The app itself, at phone width inside the frame.
  await expect(page.frameLocator('[data-testid="phone-frame"]').getByRole("link", { name: "להתחלת שיחה" })).toBeVisible();
  expect(await page.frameLocator('[data-testid="phone-frame"]').locator("html").evaluate(() => window.innerWidth)).toBe(390);

  await page.getByRole("link", { name: "חזרה לתצוגת מחשב" }).click();
  await expect(page).toHaveURL(/\/$/);
});
