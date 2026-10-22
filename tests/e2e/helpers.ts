import { expect, type Page } from "@playwright/test";
import { seenKey, TOUR_SCREENS, TOUR_SEEN } from "../../src/lib/tour/tour";

/** The local e2e server's rep access code (playwright.config.ts). Against a deployed URL: E2E_REP_CODE, if set. */
export const E2E_REP_CODE = process.env.E2E_REP_CODE ?? "e2e-rep-code-1234";

/** Log in to the rep screen (M7 access code). The session cookie then covers `page.context().request` too. */
export async function loginRep(page: Page, code = E2E_REP_CODE) {
  await page.goto("/rep");
  await page.getByTestId("rep-code").fill(code);
  await page.getByTestId("rep-login-submit").click();
  await expect(page.getByTestId("rep-queue")).toBeVisible();
}

/** Storage state with the onboarding tour already seen on every screen, so it doesn't cover pages in other specs. */
export function tourSeenState(origin: string) {
  return {
    cookies: [],
    origins: [{ origin, localStorage: TOUR_SCREENS.map((s) => ({ name: seenKey(s), value: TOUR_SEEN })) }],
  };
}

/**
 * The logo is served as the original file and decodes at full size. Production 22/10: the image optimizer
 * garbled this palette PNG (partial palette transparency), so the logo must not go through /_next/image.
 */
export async function expectLogo(page: Page) {
  const logo = page.getByRole("img", { name: "שטראוס" });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", "/brand/strauss-logo.png");
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(318);
}
