import { expect, test, type Page } from "@playwright/test";
import samples from "../../data/sample-employees.json" with { type: "json" };
import { loginRep } from "./helpers";

// M7: a conversation opens only in the browser that created it (owner cookie), and the rep screen needs the access
// code. Mock model, local server (playwright.config.ts).
const e1 = samples.employees[0];
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

async function startE001(page: Page) {
  await page.goto("/employee");
  await page.getByTestId(`demo-${e1.id}`).click();
  await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
  return new URL(page.url()).searchParams.get("c")!;
}

test.describe("conversation owner", () => {
  test("another browser gets 404 on every employee route; the owner still can", async ({ page, browser }) => {
    const id = await startE001(page);

    const other = await browser.newContext();
    try {
      const api = other.request;
      expect((await api.get(`/api/conversation?c=${id}`)).status()).toBe(404);
      expect((await api.post("/api/profile", { data: { conversationId: id, updates: [{ field: "bonus", value: 1 }] } })).status()).toBe(404);
      expect((await api.post("/api/compare", { data: { conversationId: id, options: [{ kind: "waiver" }] } })).status()).toBe(404);
      const chat = await api.post("/api/chat", { data: { conversationId: id, text: "שלום" } });
      expect(await chat.text()).toContain('"error":"not_found"');

      // a leaked link opens nothing in another browser
      const stranger = await other.newPage();
      await stranger.goto(`/employee?c=${id}`);
      await expect(stranger.getByTestId("chat-error")).toBeVisible();
      await expect(stranger.getByTestId("msg-assistant")).toHaveCount(0);
    } finally {
      await other.close();
    }

    // the owner's view is intact
    expect((await page.context().request.get(`/api/conversation?c=${id}`)).status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId("row-option-0").getByTestId("net")).toHaveText(`${fmt(e1.expected.netAlt)} ₪`);
  });

  test("the conversation response gives the owner an opaque Realtime topic, not the id", async ({ page }) => {
    const id = await startE001(page);
    const body = (await (await page.context().request.get(`/api/conversation?c=${id}`)).json()) as { topic: string };
    expect(body.topic).toMatch(/^conversation:[0-9a-f]{32,}$/);
    expect(body.topic).not.toContain(id);
  });
});

test.describe("rep access code", () => {
  test("rep API without a session → 401", async ({ request }) => {
    expect((await request.get("/api/rep/questions")).status()).toBe(401);
    // the live fallback check makes a real LLM call: never without a rep session
    expect((await request.post("/api/health/fallback")).status()).toBe(401);
    const answer = await request.post("/api/rep/answer", {
      data: { questionId: crypto.randomUUID(), answer: { field: "group", value: "א" } },
    });
    expect(answer.status()).toBe(401);
  });

  test("the rep screen asks for the code; a wrong code shows a Hebrew error; the right one opens the queue", async ({ page }) => {
    await page.goto("/rep");
    await expect(page.getByTestId("rep-login")).toBeVisible();
    await expect(page.getByTestId("rep-queue")).toHaveCount(0);

    await page.getByTestId("rep-code").fill("wrong-code");
    await page.getByTestId("rep-login-submit").click();
    await expect(page.getByTestId("rep-login-error")).toContainText(/[֐-׿]/);

    await loginRep(page);
    expect((await page.context().request.get("/api/rep/questions")).status()).toBe(200);
    await page.reload();
    await expect(page.getByTestId("rep-queue")).toBeVisible();

    await page.getByTestId("rep-logout").click();
    await expect(page.getByTestId("rep-login")).toBeVisible();
    expect((await page.context().request.get("/api/rep/questions")).status()).toBe(401);
  });
});
