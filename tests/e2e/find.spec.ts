import { expect, test } from "@playwright/test";
import samples from "../../data/sample-employees.json" with { type: "json" };
import rules from "../../data/strauss-rules.json" with { type: "json" };

// F8 constraint search against the mock model (AGENT_MODEL=mock): the script maps the request to findOptions,
// the real engine finds and computes the cars, and the results land in the existing comparison table.
const e1 = samples.employees[0];

test("F8: electric with a net limit → matching cars in the comparison table", async ({ page }) => {
  await page.goto("/employee");
  await expect(page.getByTestId("mock-badge")).toBeVisible();
  // the E-001 run saves a complete profile first
  await page.getByTestId(`demo-${e1.id}`).click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);

  await page.getByTestId("demo-find-ev").click();
  await expect(page.getByTestId("tool-findOptions")).toBeVisible();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(2);
  const reply = page.getByTestId("msg-assistant").last();
  await expect(reply).toContainText("מתאים לכל התנאים");

  const table = page.getByTestId("comparison-table");
  await expect(table.getByTestId("row-today")).toBeVisible();
  await expect(table.getByTestId("row-option-0")).toBeVisible();
  const options = await table.locator('[data-testid^="row-option-"]').count();
  expect(options).toBeGreaterThan(0);
  expect(options).toBeLessThanOrEqual(rules.search.maxMatches);
  // every number in the reply is checked by the guard: the reply was not blocked
  await expect(reply).not.toContainText("לא הצלחתי");
});
