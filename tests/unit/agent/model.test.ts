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
