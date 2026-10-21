import { expect, test, type Page } from "@playwright/test";
import samples from "../../data/sample-employees.json" with { type: "json" };

// F6 (mock mode): upload → confirm card → the profile is filled only after save. The mock extractor answers
// E-001's salary fields with the bonus unread, and "not a payslip" for a file named *not-payslip*.
const e1 = samples.employees[0].profile;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const upload = (page: Page, name: string) => page.getByTestId("payslip-input").setInputFiles({ name, mimeType: "image/png", buffer: PNG });

test.describe("payslip upload", () => {
  test("paperclip → confirm card → save fills the profile", async ({ page }) => {
    await page.goto("/employee");
    await expect(page.getByTestId("payslip-chat")).toBeVisible();
    await upload(page, "payslip.png");

    const card = page.getByTestId("payslip-confirm");
    await expect(card.getByTestId("payslip-baseSalary")).toHaveValue(String(e1.baseSalary));
    await expect(card.getByTestId("payslip-pensionPct")).toHaveValue("6");
    await expect(card.getByTestId("payslip-studyFundPct")).toHaveValue("2.5");
    await expect(card.getByTestId("payslip-bonus")).toHaveValue("");
    await expect(card.getByTestId("payslip-unread-bonus")).toHaveText("לא זוהה — יש למלא");

    // Nothing reaches the profile before save.
    const panel = page.getByTestId("profile-panel");
    await expect(panel.getByTestId("profile-baseSalary")).toHaveValue("");

    await card.getByTestId("payslip-bonus").fill(String(e1.bonus));
    await card.getByTestId("payslip-save").click();

    await expect(page.getByTestId("payslip-card")).toBeHidden();
    await expect(page.getByTestId("msg-assistant").last()).toContainText("עדכנתי");
    await expect(panel.getByTestId("profile-baseSalary")).toHaveValue(String(e1.baseSalary));
    await expect(panel.getByTestId("profile-bonus")).toHaveValue(String(e1.bonus));
    await expect(panel.getByTestId("profile-creditPoints")).toHaveValue(String(e1.creditPoints));
    // Not on a payslip: never filled from it.
    await expect(panel.getByTestId("profile-childrenUnder23")).toHaveValue("");
  });

  test("the panel button opens the same flow; cancel saves nothing", async ({ page }) => {
    await page.goto("/employee");
    await expect(page.getByTestId("payslip-panel")).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("payslip-panel").click();
    await (await chooser).setFiles({ name: "payslip.png", mimeType: "image/png", buffer: PNG });

    await expect(page.getByTestId("payslip-confirm")).toBeVisible();
    await page.getByTestId("payslip-confirm").getByRole("button", { name: "ביטול" }).click();
    await expect(page.getByTestId("payslip-card")).toBeHidden();
    await expect(page.getByTestId("profile-panel").getByTestId("profile-baseSalary")).toHaveValue("");
  });

  test("not a payslip → a clear message, nothing filled", async ({ page }) => {
    await page.goto("/employee");
    await upload(page, "not-payslip.png");
    await expect(page.getByTestId("payslip-error")).toContainText("לא נראה כמו תלוש שכר");
    await expect(page.getByTestId("payslip-confirm")).toHaveCount(0);
    await expect(page.getByTestId("profile-panel").getByTestId("profile-baseSalary")).toHaveValue("");
  });

  test("a file that isn't PDF / JPG / PNG is refused by its bytes", async ({ page }) => {
    await page.goto("/employee");
    await page.getByTestId("payslip-input").setInputFiles({ name: "payslip.png", mimeType: "image/png", buffer: Buffer.from("plain text") });
    await expect(page.getByTestId("payslip-error")).toContainText("PDF, JPG או PNG");
  });
});
