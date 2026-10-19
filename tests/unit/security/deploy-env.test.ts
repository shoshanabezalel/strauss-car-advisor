import { describe, expect, it } from "vitest";
import { assertDeployEnv, deployEnvProblems } from "@/lib/env";

// M7: a Vercel build with a bad env fails early with a readable message (next.config.ts calls assertDeployEnv).
const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x",
  GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
  REP_ACCESS_CODE: "demo-code-1234",
  APP_SECRET: "x".repeat(40),
};

describe("deployEnvProblems", () => {
  it("a complete env has no problems; AGENT_MODEL and ANTHROPIC_API_KEY are optional", () => {
    expect(deployEnvProblems(good)).toEqual([]);
    expect(deployEnvProblems({ ...good, AGENT_MODEL: "gemini-3.5-flash", ANTHROPIC_API_KEY: "a-key" })).toEqual([]);
  });

  it("refuses the mock model", () => {
    expect(deployEnvProblems({ ...good, AGENT_MODEL: "mock" }).join(" ")).toMatch(/AGENT_MODEL/);
  });

  it("refuses e2e tagging in a deploy", () => {
    expect(deployEnvProblems({ ...good, CONVERSATION_SOURCE: "e2e" }).join(" ")).toMatch(/CONVERSATION_SOURCE/);
  });

  it("names each missing or weak variable", () => {
    const problems = deployEnvProblems({
      ...good,
      SUPABASE_SERVICE_ROLE_KEY: "",
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      REP_ACCESS_CODE: "1234",
      APP_SECRET: "short",
    }).join("\n");
    for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "REP_ACCESS_CODE", "APP_SECRET"]) expect(problems).toContain(name);
  });

  it("assertDeployEnv throws with every problem in the message, and passes a good env", () => {
    expect(() => assertDeployEnv(good)).not.toThrow();
    expect(() => assertDeployEnv({ ...good, AGENT_MODEL: "mock", APP_SECRET: "" })).toThrow(/AGENT_MODEL[\s\S]*APP_SECRET|APP_SECRET[\s\S]*AGENT_MODEL/);
  });
});
