import { devices, expect, test, type Page } from "@playwright/test";
import catalog from "../../data/catalog.json" with { type: "json" };
import script from "../../data/challenge-script.json" with { type: "json" };
import { loginRep } from "./helpers";

// A7 / A12 / A13 with the mock model. The rep's answer reaches the employee screen through Realtime only:
// the polling fallback is off in e2e (playwright.config.ts), and the employee page is never reloaded before the check.
const answer = script.repAnswer;
const car = catalog.cars.find((c) => c.id === answer.carId)!;
const shekels = (text: string) => Number(text.replace(/[^\d]/g, ""));
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const conversationId = (page: Page) => new URL(page.url()).searchParams.get("c")!;
const card = (rep: Page, id: string) => rep.locator(`[data-testid="rep-question"][data-conversation-id="${id}"]`);

async function a7WaitingForRep(page: Page) {
  await page.goto("/employee");
  await page.getByTestId("demo-a7").click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  await expect(page.getByTestId("notice-participation_unconfirmed")).toBeVisible();
  await page.getByTestId("demo-ask-rep").click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(2);
  await expect(page.getByTestId("notice-rep_question_open")).toBeVisible();
  await expect(page.getByTestId("rep-status-item")).toHaveAttribute("data-status", "open");
  return conversationId(page);
}

test.describe("representative loop", () => {
  test("A7 + A13: employee asks, rep answers, employee sees the recomputed comparison without a reload", async ({ page, context }) => {
    // The rep API needs the rep session: requests go through the context, which carries its cookie (M7).
    const request = context.request;
    const id = await a7WaitingForRep(page);
    const netBefore = shekels(await page.getByTestId("row-option-0").getByTestId("net").innerText());

    // A13: a reload while waiting keeps the chat, the table and the open question
    await page.reload();
    await expect(page.getByTestId("msg-assistant")).toHaveCount(2);
    await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(netBefore)} ₪`);
    await expect(page.getByTestId("rep-status-item")).toHaveAttribute("data-status", "open");
    await expect(page.locator('[data-realtime="subscribed"]')).toBeVisible();

    // the rep sees who asks, which car and what is missing
    const rep = await context.newPage();
    await loginRep(rep);
    const q = card(rep, id);
    await expect(q).toBeVisible();
    await expect(q.getByTestId("rep-context")).toContainText(car.model);
    await expect(q).toContainText("השתתפות עצמית");
    await expect(q.getByTestId("rep-context")).toContainText(`קבוצת זכאות ${script.profile.group}`);

    // above the bound → 422 with a Hebrew message, question stays open
    const questionId = (await q.getAttribute("data-question-id"))!;
    const tooHigh = await request.post("/api/rep/answer", {
      data: { questionId, answer: { ...answer, value: Math.max(car.monthlyCost, 100000) + 1 } },
    });
    expect(tooHigh.status()).toBe(422);
    expect(((await tooHigh.json()) as { message: string }).message).toMatch(/[֐-׿]/);

    await q.getByTestId("answer-amount").fill(String(answer.value));
    await q.getByTestId("answer-by").fill("נציג/ת בדיקה");
    await q.getByTestId("answer-submit").click();
    await expect(q).toHaveCount(0);

    // employee screen, no reload: rep reply, confirmed participation, net changed by exactly the participation change
    await expect(page.getByTestId("msg-assistant")).toHaveCount(3);
    await expect(page.getByTestId("msg-assistant").last()).toContainText(answer.value.toLocaleString("en-US"));
    await expect(page.getByTestId("notice-rep_answered")).toBeVisible();
    const row = page.getByTestId("row-option-0");
    await expect(row.getByTestId("participation-rep")).toBeVisible();
    await expect(row).toContainText(`${fmt(answer.value)} ₪`);
    const expectedNet = netBefore - (answer.value - car.defaultParticipation);
    await expect(row.getByTestId("net")).toHaveText(`${fmt(expectedNet)} ₪`);
    await expect(page.getByTestId("notice-participation_unconfirmed")).toHaveAttribute("data-resolved", "true");
    await expect(page.getByTestId("notice-rep_question_open")).toHaveAttribute("data-resolved", "true");
    await expect(page.getByTestId("rep-status-item")).toHaveAttribute("data-status", "answered");

    // a second answer is refused
    const again = await request.post("/api/rep/answer", { data: { questionId, answer } });
    expect(again.status()).toBe(409);

    // A13 after the answer: everything persists
    await page.reload();
    await expect(page.getByTestId("msg-assistant")).toHaveCount(3);
    await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(expectedNet)} ₪`);
    await expect(page.getByTestId("rep-status-item")).toHaveAttribute("data-status", "answered");
  });

  test("A12: unknown participation opens a question the rep can answer with a catalog car", async ({ page, context }) => {
    await page.goto("/employee");
    await page.getByTestId("demo-rep").click();
    await expect(page.getByTestId("notice-rep_question_open")).toBeVisible();
    const id = conversationId(page);

    const rep = await context.newPage();
    await loginRep(rep);
    const q = card(rep, id);
    await expect(q).toBeVisible();
    await expect(q.getByTestId("answer-car")).toBeVisible();
    await q.getByTestId("answer-car").selectOption(car.id);
    await q.getByTestId("answer-amount").fill(String(car.defaultParticipation));
    await q.getByTestId("answer-submit").click();
    await expect(q).toHaveCount(0);

    await expect(page.getByTestId("notice-rep_answered")).toBeVisible();
    await expect(page.getByTestId("rep-status-item")).toHaveAttribute("data-status", "answered");
  });
});

test.describe("rep screen (mobile)", () => {
  test.use({ viewport: devices["Pixel 7"].viewport, isMobile: true, hasTouch: true });

  test("cards fit a phone: no horizontal scroll", async ({ page, context }) => {
    await a7WaitingForRep(page);
    const rep = await context.newPage();
    await loginRep(rep);
    await expect(card(rep, conversationId(page))).toBeVisible();
    const overflow = await rep.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("rep API", () => {
  test("bad bodies and unknown questions", async ({ page }) => {
    await loginRep(page);
    const request = page.context().request;
    expect((await request.post("/api/rep/answer", { data: { questionId: "x", answer } })).status()).toBe(400);
    expect((await request.post("/api/rep/answer", { data: { questionId: crypto.randomUUID(), answer: { field: "note" } } })).status()).toBe(400);
    expect((await request.post("/api/rep/answer", { data: { questionId: crypto.randomUUID(), answer } })).status()).toBe(404);
    expect((await request.get("/api/rep/questions")).status()).toBe(200);
  });
});
