import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentModel, isMockMode } from "@/lib/agent/model";

afterEach(() => vi.unstubAllEnvs());

describe("createAgentModel", () => {
  it("AGENT_MODEL=mock selects the scripted model and needs no Google key", () => {
    vi.stubEnv("AGENT_MODEL", "mock");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isMockMode()).toBe(true);
    const model = createAgentModel();
    expect(typeof model === "object" && model.provider).toBe("mock");
  });

  it("refuses the mock in production", () => {
    vi.stubEnv("AGENT_MODEL", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createAgentModel()).toThrow(/production/);
  });

  it("the live model is the default and still needs the key", () => {
    vi.stubEnv("AGENT_MODEL", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    expect(isMockMode()).toBe(false);
    expect(() => createAgentModel()).toThrow();
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    const model = createAgentModel();
    expect(typeof model === "object" && model.provider).not.toBe("mock");
  });
});

describe("fallback model (M7)", () => {
  it("createFallbackOnlyModel is Anthropic, Haiku by default, overridable by FALLBACK_MODEL", async () => {
    const { createFallbackOnlyModel } = await import("@/lib/agent/model");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("FALLBACK_MODEL", "");
    const m = createFallbackOnlyModel();
    expect(typeof m === "object" && m.provider).toMatch(/^anthropic/);
    expect(typeof m === "object" && m.modelId).toBe("claude-haiku-5-5");
    vi.stubEnv("FALLBACK_MODEL", "claude-sonnet-5-5");
    expect((createFallbackOnlyModel() as { modelId: string }).modelId).toBe("claude-sonnet-5-5");
  });

  it("createFallbackOnlyModel needs the Anthropic key", async () => {
    const { createFallbackOnlyModel } = await import("@/lib/agent/model");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createFallbackOnlyModel()).toThrow();
  });

  it("the live model works with or without the Anthropic key (fallback is optional)", () => {
    vi.stubEnv("AGENT_MODEL", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createAgentModel()).not.toThrow();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(() => createAgentModel({ onFallback: () => {} })).not.toThrow();
  });
});

// FALLBACK_MODEL chooses the fallback provider by its prefix; the same Google key serves a second Gemini model.
describe("fallbackConfig", () => {
  const env = (e: Record<string, string>) => ({ GOOGLE_GENERATIVE_AI_API_KEY: "g-key", ...e });

  it("a Gemini fallback uses the Google key", async () => {
    const { fallbackConfig } = await import("@/lib/env");
    expect(fallbackConfig(env({ FALLBACK_MODEL: "gemini-3.5-flash-lite" }))).toEqual({ provider: "google", model: "gemini-3.5-flash-lite", apiKey: "g-key" });
  });

  it("a Claude fallback uses the Anthropic key; with only that key the default is Haiku", async () => {
    const { fallbackConfig } = await import("@/lib/env");
    expect(fallbackConfig(env({ FALLBACK_MODEL: "claude-sonnet-5-5", ANTHROPIC_API_KEY: "a-key" }))).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "a-key" });
    expect(fallbackConfig(env({ ANTHROPIC_API_KEY: "a-key" }))).toEqual({ provider: "anthropic", model: "claude-haiku-5-5", apiKey: "a-key" });
  });

  it("no FALLBACK_MODEL and no Anthropic key → no fallback", async () => {
    const { fallbackConfig } = await import("@/lib/env");
    expect(fallbackConfig(env({}))).toBeUndefined();
    expect(fallbackConfig(env({ FALLBACK_MODEL: "", ANTHROPIC_API_KEY: "" }))).toBeUndefined();
  });

  it("refuses a missing key, an unknown provider, or the primary model itself", async () => {
    const { fallbackConfig } = await import("@/lib/env");
    expect(() => fallbackConfig(env({ FALLBACK_MODEL: "claude-haiku-5-5" }))).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => fallbackConfig({ FALLBACK_MODEL: "gemini-3.5-flash-lite" })).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => fallbackConfig(env({ FALLBACK_MODEL: "gpt-5" }))).toThrow(/gemini-|claude-/);
    expect(() => fallbackConfig(env({ FALLBACK_MODEL: "gemini-3.5-flash" }))).toThrow(/primary/);
    expect(() => fallbackConfig(env({ AGENT_MODEL: "gemini-3.5-flash-lite", FALLBACK_MODEL: "gemini-3.5-flash-lite" }))).toThrow(/primary/);
  });

  it("createFallbackOnlyModel builds a Google model for a Gemini fallback, without an Anthropic key", async () => {
    const { createFallbackOnlyModel } = await import("@/lib/agent/model");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AGENT_MODEL", "");
    vi.stubEnv("FALLBACK_MODEL", "gemini-3.5-flash-lite");
    const m = createFallbackOnlyModel() as { provider: string; modelId: string };
    expect(m.provider).toMatch(/^google/);
    expect(m.modelId).toBe("gemini-3.5-flash-lite");
  });
});
