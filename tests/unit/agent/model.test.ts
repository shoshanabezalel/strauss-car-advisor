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
