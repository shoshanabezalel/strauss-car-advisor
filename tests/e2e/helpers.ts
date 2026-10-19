import { expect, type Page } from "@playwright/test";

/** The local e2e server's rep access code (playwright.config.ts). Against a deployed URL: E2E_REP_CODE, if set. */
export const E2E_REP_CODE = process.env.E2E_REP_CODE ?? "e2e-rep-code-1234";

/** Log in to the rep screen (M7 access code). The session cookie then covers `page.context().request` too. */
export async function loginRep(page: Page, code = E2E_REP_CODE) {
  await page.goto("/rep");
  await page.getByTestId("rep-code").fill(code);
  await page.getByTestId("rep-login-submit").click();
  await expect(page.getByTestId("rep-queue")).toBeVisible();
}
