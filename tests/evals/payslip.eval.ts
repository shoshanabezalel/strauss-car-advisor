import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { createFallbackOnlyModel, createPrimaryModel } from "@/lib/agent/model";
import { loadConfig } from "@/lib/config";
import { fallbackConfig } from "@/lib/env";
import { createModelExtractor, type PayslipFile } from "@/lib/payslip/extract";
import { SAMPLE } from "../../scripts/make-sample-payslip";
import { rateLimited } from "./rate-limit";

// F6 live eval (`npm run eval:agent`): the real model reads the synthetic payslip (scripts/make-sample-payslip.ts).
// Same targets as agent.eval.ts: EVAL_TARGET=fallback runs it on the fallback model alone.
loadEnv({ path: ".env.local", quiet: true });
const target = process.env.EVAL_TARGET === "fallback" ? "fallback" : "primary";
const hasKey =
  (target === "fallback" ? Boolean(fallbackConfig()) : Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)) && process.env.AGENT_MODEL !== "mock";

const ranges = loadConfig().rules.payslip.ranges;
const extract = () => createModelExtractor(rateLimited(target === "fallback" ? createFallbackOnlyModel() : createPrimaryModel()), ranges);
const fixture = (name: string, mediaType: PayslipFile["mediaType"]): PayslipFile => ({
  bytes: new Uint8Array(readFileSync(`tests/fixtures/payslip/${name}`)),
  mediaType,
  name,
});

describe.skipIf(!hasKey)(`payslip reading (live, ${target})`, () => {
  it.each([
    ["synthetic-payslip.png", "image/png"],
    ["synthetic-payslip.pdf", "application/pdf"],
  ] as const)("%s: exactly the six values, the employee's rates, nothing else", async (name, mediaType) => {
    const res = await extract()(fixture(name, mediaType));
    expect(res).toEqual({ status: "ok", fields: SAMPLE });
  });

  it("a lunch menu is not a payslip", async () => {
    expect(await extract()(fixture("not-payslip.png", "image/png"))).toEqual({ status: "not_payslip" });
  });
});
