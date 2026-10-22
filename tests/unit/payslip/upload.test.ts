import { readFileSync } from "node:fs";
import { APICallError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Extractor } from "@/lib/payslip/extract";
import { payslipLimits } from "@/lib/payslip/limits";
import { handlePayslipUpload, MAX_PAYSLIP_BYTES } from "@/lib/payslip/upload";
import { createMemoryRateLimiter, enforceLimits, LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/security/rate-limit";

// F6: checks before the model call, Hebrew messages, and nothing kept or logged.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [...Buffer.from("%PDF-1.7\n")];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const fileOf = (bytes: number[] | Uint8Array, name: string, type = "") => new File([new Uint8Array(bytes)], name, { type });
const fields = { baseSalary: 18500, commissions: 0, bonus: null, pensionPct: 6, studyFundPct: 2.5, creditPoints: 2.75 };
const notes = { commissions: "not_on_payslip" as const, pensionPct: "computed" as const };
const okExtractor = (): Extractor & ReturnType<typeof vi.fn> => vi.fn(async () => ({ status: "ok" as const, fields, notes })) as never;

afterEach(() => vi.restoreAllMocks());

describe("handlePayslipUpload", () => {
  it("no file → 400, the model is not called", async () => {
    const extract = okExtractor();
    expect((await handlePayslipUpload({ file: null, extract })).status).toBe(400);
    expect((await handlePayslipUpload({ file: fileOf([], "empty.pdf") , extract })).status).toBe(400);
    expect(extract).not.toHaveBeenCalled();
  });

  it("over the size limit → 413 with a Hebrew message, the model is not called", async () => {
    const extract = okExtractor();
    const big = new Uint8Array(MAX_PAYSLIP_BYTES + 1);
    big.set(PNG);
    const res = await handlePayslipUpload({ file: fileOf(big, "big.png"), extract });
    expect(res.status).toBe(413);
    expect((res.body as { message?: string }).message).toMatch(/[א-ת]/);
    expect(extract).not.toHaveBeenCalled();
  });

  it("the type comes from the bytes, not the name or the declared type", async () => {
    const extract = okExtractor();
    const text = await handlePayslipUpload({ file: fileOf([...Buffer.from("hello")], "slip.pdf", "application/pdf"), extract });
    expect(text.status).toBe(415);
    expect(extract).not.toHaveBeenCalled();

    await handlePayslipUpload({ file: fileOf([...PNG, 1, 2], "renamed.pdf", "application/pdf"), extract });
    await handlePayslipUpload({ file: fileOf([...PDF, 1], "x.png"), extract });
    await handlePayslipUpload({ file: fileOf([...JPG, 1], "x"), extract });
    expect(extract.mock.calls.map(([f]) => f.mediaType)).toEqual(["image/png", "application/pdf", "image/jpeg"]);
  });

  it("a payslip → 200 with the fields and their notes only", async () => {
    const res = await handlePayslipUpload({ file: fileOf([...PNG, 1], "slip.png"), extract: okExtractor() });
    expect(res).toEqual({ status: 200, body: { status: "ok", fields, notes } });
  });

  it.each([
    ["not_payslip", /לא נראה כמו תלוש/],
    ["unreadable", /לא הצלחתי לקרוא/],
  ] as const)("%s → 422 with a clear Hebrew message and no fields", async (status, message) => {
    const res = await handlePayslipUpload({ file: fileOf([...PNG, 1], "x.png"), extract: async () => ({ status }) });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ status, message: expect.stringMatching(message) });
  });

  it("a failing model call is logged without the file: no bytes, no base64, no error object", async () => {
    const bytes = new Uint8Array([...PNG, ...Buffer.from("SECRET-PAYSLIP-CONTENT")]);
    const b64 = Buffer.from(bytes).toString("base64");
    const err = Object.assign(new Error(`bad request: ${b64}`), { name: "AI_APICallError", requestBodyValues: { data: b64 } });
    const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log"), vi.spyOn(console, "info")];
    for (const l of logs) l.mockImplementation(() => undefined);

    const res = await handlePayslipUpload({ file: fileOf(bytes, "x.png"), extract: async () => Promise.reject(err) });
    expect(res.status).toBe(502);
    expect((res.body as { message?: string }).message).toMatch(/[א-ת]/);
    const logged = JSON.stringify(logs.flatMap((l) => l.mock.calls), (_k, v) => (v instanceof Error ? { m: v.message } : v));
    expect(logs[0]).toHaveBeenCalled();
    expect(logged).not.toContain(b64.slice(0, 16));
    expect(logged).not.toContain("SECRET");
    expect(logs[0].mock.calls.flat().some((a) => a instanceof Error || (typeof a === "object" && a !== null))).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(b64.slice(0, 16));
  });

  it("a provider error is logged with its status and the provider's message (capped), never the request body", async () => {
    const b64 = Buffer.from("SECRET-PAYSLIP-CONTENT").toString("base64");
    const providerMessage = `Invalid argument: ${"x".repeat(400)}`;
    const err = new APICallError({
      message: "Bad Request",
      url: "https://example.test/v1beta/models/m:generateContent",
      requestBodyValues: { contents: [{ inlineData: { data: b64 } }] },
      statusCode: 400,
      responseBody: JSON.stringify({ error: { code: 400, message: providerMessage, status: "INVALID_ARGUMENT" } }),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await handlePayslipUpload({ file: fileOf([...PNG, 1], "x.png"), extract: async () => Promise.reject(err) });
    expect(res.status).toBe(502);
    const line = error.mock.calls.flat().join(" ");
    expect(line).toContain("AI_APICallError");
    expect(line).toContain("400");
    expect(line).toContain("Invalid argument: xxx");
    expect(line).not.toContain("x".repeat(300));
    expect(line).not.toContain(b64.slice(0, 16));
    expect(line).not.toContain("example.test");
  });
});

describe("payslip rate limits", () => {
  it("the per-IP limit, then 429 with the Hebrew message; each read also counts in the environment's daily LLM cap", async () => {
    const limiter = createMemoryRateLimiter(() => 0);
    const hit = vi.spyOn(limiter, "hit");
    for (let i = 0; i < LIMITS.payslipIp.max; i++) expect(await enforceLimits(limiter, payslipLimits("1.2.3.4", "production"))).toBeNull();
    const refused = await enforceLimits(limiter, payslipLimits("1.2.3.4", "production"));
    expect(refused?.status).toBe(429);
    expect((await refused!.json()).message).toBe(RATE_LIMIT_MESSAGE);
    expect(await enforceLimits(limiter, payslipLimits("5.6.7.8", "production"))).toBeNull();
    expect(hit).toHaveBeenCalledWith(`${LIMITS.chatGlobalDay.name}:production`, LIMITS.chatGlobalDay.windowSec, LIMITS.chatGlobalDay.max);
  });

  it("the route checks the limits before reading the upload", () => {
    const route = readFileSync("src/app/api/payslip/route.ts", "utf8");
    const limitAt = route.indexOf("payslipLimits(");
    expect(limitAt).toBeGreaterThan(-1);
    expect(limitAt).toBeLessThan(route.indexOf("formData("));
  });
});

describe("the payslip route keeps nothing", () => {
  const src = readFileSync("src/app/api/payslip/route.ts", "utf8") + readFileSync("src/lib/payslip/upload.ts", "utf8");

  // (A rate limiter may use the DB for its counters; the file and its values never go there.)
  it("touches no conversation store, gaps log or file system", () => {
    for (const forbidden of ["@/lib/chat", "@/lib/gaps", "createSupabaseStore", "chatDeps", "node:fs", "writeFile", "console.log"]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});
