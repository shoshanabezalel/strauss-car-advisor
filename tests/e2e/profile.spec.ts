import { devices, expect, test, type Page } from "@playwright/test";
import catalog from "../../data/catalog.json" with { type: "json" };
import samples from "../../data/sample-employees.json" with { type: "json" };

// M6 (F4, F5): edit the profile and swap cars on the screen; the engine recomputes; explanations are visible.
const e1 = samples.employees[0];
const current = e1.profile.current as { carId: string; participation: number };
const atto = catalog.cars.find((c) => c.id === (e1.alternative as { carId: string }).carId)!;
const ev3 = catalog.cars.find((c) => c.model === "EV3")!;
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const shekels = (text: string) => Number(text.replace(/[^\d]/g, ""));

async function startE001(page: Page) {
  await page.goto("/employee");
  await page.getByTestId(`demo-${e1.id}`).click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
}

test.describe("profile and options (desktop)", () => {
  test("the explanation lines show under the option", async ({ page }) => {
    await startE001(page);
    const explanation = page.getByTestId("row-option-0").getByTestId("explanation");
    await expect(explanation).toContainText("שווי השימוש יורד");
    await expect(explanation).toContainText("החזר חשמל");
  });

  // Giving up the car: the screen shows the engine's breakdown, whose net effects add up to the change shown
  // (user, 21/10: gross amounts that seemed to add up to something else read as an error).
  test("waiver (E-005): one line per component, and the effects add up to the change", async ({ page }) => {
    const e5 = samples.employees.find((e) => e.alternative.kind === "waiver")!;
    await page.goto("/employee");
    await page.getByTestId(`demo-${e5.id}`).click();
    const row = page.getByTestId("row-option-0");
    await expect(row.getByTestId("diff")).toContainText(fmt(Math.abs(e5.expected.diff)));
    const lines = row.getByTestId("explanation").locator("p");
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText("השתתפות");
    await expect(lines.nth(1)).toContainText("שווי שימוש הוא לא כסף אלא סכום שמחויב במס");
    await expect(lines.nth(2)).toContainText("אחרי מס");
    const effects = await lines.evaluateAll((ps) =>
      ps.map((p) => {
        const m = p.textContent!.match(/(עלייה|ירידה) של ([\d,]+) ₪ בנטו/)!;
        return (m[1] === "עלייה" ? 1 : -1) * Number(m[2].replace(/,/g, ""));
      }),
    );
    expect(effects.reduce((s, x) => s + x, 0)).toBe(e5.expected.diff);

    // The chat: "איך זה מחושב?" under the reply, closed until opened, with the same lines as the table.
    const breakdown = page.getByTestId("breakdown").last();
    await expect(breakdown).toBeVisible();
    await expect(breakdown.getByTestId("breakdown-line").first()).toBeHidden();
    await breakdown.getByText("איך זה מחושב?").click();
    await expect(breakdown.getByTestId("breakdown-line")).toHaveText(await lines.allTextContents());

    // Stored with the reply: still there after a reload.
    await page.reload();
    await expect(page.getByTestId("breakdown").last().getByTestId("breakdown-line")).toHaveCount(3);
  });

  test("editing today's participation recomputes: today's net drops by exactly the change", async ({ page }) => {
    await startE001(page);
    const panel = page.getByTestId("profile-panel");
    await expect(panel.getByTestId("profile-baseSalary")).toHaveValue(e1.profile.baseSalary.toLocaleString("en-US"));
    await expect(panel.getByTestId("profile-pensionPct")).toHaveValue("6");
    await panel.getByTestId("profile-current-participation").fill(String(current.participation + 100));
    await panel.getByTestId("profile-save").click();

    await expect(page.getByTestId("msg-assistant")).toHaveCount(2);
    await expect(page.getByTestId("msg-assistant").last()).toContainText("עדכנתי");
    await expect(page.getByTestId("row-today").getByTestId("net")).toHaveText(`${fmt(e1.expected.netToday - 100)} ₪`);

    // reload keeps it
    await page.reload();
    await expect(page.getByTestId("profile-panel").getByTestId("profile-current-participation")).toHaveValue((current.participation + 100).toLocaleString("en-US"));
    await expect(page.getByTestId("row-today").getByTestId("net")).toHaveText(`${fmt(e1.expected.netToday - 100)} ₪`);
  });

  test("swapping cars: EV3, then back to ATTO 3 at the sheet's net; adding waiver adds a row", async ({ page }) => {
    await startE001(page);
    const picker = page.getByTestId("option-picker");
    await picker.getByTestId("option-select").selectOption(ev3.id);
    await picker.getByTestId("option-replace").click();
    await expect(page.getByTestId("row-option-0")).toContainText(ev3.model);
    const ev3Net = shekels(await page.getByTestId("row-option-0").getByTestId("net").innerText());
    expect(ev3Net).toBeGreaterThan(0);

    await picker.getByTestId("option-select").selectOption(atto.id);
    await picker.getByTestId("option-replace").click();
    await expect(page.getByTestId("row-option-0")).toContainText(atto.model);
    await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);

    await picker.getByTestId("option-select").selectOption("waiver");
    await picker.getByTestId("option-add").click();
    await expect(page.getByTestId("row-option-1")).toContainText("ויתור");
    await expect(page.getByTestId("row-option-1")).toContainText("אחזקה");

    await page.reload();
    await expect(page.getByTestId("row-option-1")).toContainText("ויתור");
    await picker.getByTestId("option-remove-1").click();
    await expect(page.getByTestId("row-option-1")).toHaveCount(0);
  });

  test("an invalid value shows a Hebrew error and changes nothing", async ({ page }) => {
    await startE001(page);
    const panel = page.getByTestId("profile-panel");
    await panel.getByTestId("profile-pensionPct").fill("600");
    await panel.getByTestId("profile-save").click();
    await expect(panel.getByTestId("profile-error")).toBeVisible();
    await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  });

  test("the form can start a conversation", async ({ page }) => {
    await page.goto("/employee");
    const panel = page.getByTestId("profile-panel");
    await panel.getByTestId("profile-group").selectOption(e1.profile.group);
    await panel.getByTestId("profile-save").click();
    await expect(page).toHaveURL(/\?c=[0-9a-f-]{36}$/);
    await expect(page.getByTestId("msg-assistant")).toContainText("שכר בסיס");
  });
});

test.describe("profile and options (mobile)", () => {
  test.use({ viewport: devices["Pixel 7"].viewport, isMobile: true, hasTouch: true });

  test("the panel is collapsed until opened; no horizontal scroll", async ({ page }) => {
    await startE001Mobile(page);
    await expect(page.getByTestId("profile-baseSalary")).toBeHidden();
    await page.getByTestId("profile-toggle").click();
    await expect(page.getByTestId("profile-baseSalary")).toBeVisible();
    await expect(page.getByTestId("card-option-0").getByTestId("explanation")).toContainText("שווי השימוש");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

async function startE001Mobile(page: Page) {
  await page.goto("/employee");
  await page.getByTestId(`demo-${e1.id}`).click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  await expect(page.getByTestId("card-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
}
