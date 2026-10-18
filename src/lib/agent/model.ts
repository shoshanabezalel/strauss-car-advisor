import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { agentEnv } from "@/lib/env";

/** The live agent model (server side: reads the API key from env). Unit tests use a mock model instead. */
export function createAgentModel(): LanguageModel {
  const env = agentEnv();
  return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(env.AGENT_MODEL);
}
