import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { loadConfig } from "@/lib/config";
import { agentEnv, MOCK_MODEL } from "@/lib/env";
import { createMockModel } from "./mock-model";

/** AGENT_MODEL=mock: the scripted model (local dev / e2e without network access to the LLM). */
export function isMockMode(): boolean {
  return process.env.AGENT_MODEL === MOCK_MODEL;
}

/** The agent model (server side: reads the API key from env). Unit tests pass a mock model directly. */
export function createAgentModel(): LanguageModel {
  if (isMockMode()) {
    if (process.env.NODE_ENV === "production") throw new Error("AGENT_MODEL=mock is not allowed in production");
    return createMockModel(loadConfig(), { delayMs: Number(process.env.AGENT_MOCK_DELAY_MS) || 0 });
  }
  const env = agentEnv();
  return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(env.AGENT_MODEL);
}
