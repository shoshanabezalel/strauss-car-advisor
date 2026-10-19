import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from "ai";
import { loadConfig } from "@/lib/config";
import { agentEnv, fallbackEnv, MOCK_MODEL } from "@/lib/env";
import { withFallback } from "./fallback-model";
import { createMockModel } from "./mock-model";

/** AGENT_MODEL=mock: the scripted model (local dev / e2e without network access to the LLM). */
export function isMockMode(): boolean {
  return process.env.AGENT_MODEL === MOCK_MODEL;
}

/**
 * The agent model for one chat turn (server side: reads the API keys from env). Gemini, retried once on 429 / 503,
 * then Claude Haiku if ANTHROPIC_API_KEY is set (fallback-model.ts). Unit tests pass a mock model directly.
 */
export function createAgentModel(hooks: { onFallback?: () => void } = {}): LanguageModel {
  if (isMockMode()) {
    if (process.env.NODE_ENV === "production") throw new Error("AGENT_MODEL=mock is not allowed in production");
    return createMockModel(loadConfig(), { delayMs: Number(process.env.AGENT_MOCK_DELAY_MS) || 0 });
  }
  const primary = createPrimaryModel();
  const fallback = process.env.ANTHROPIC_API_KEY ? createFallbackOnlyModel() : undefined;
  return withFallback(primary, fallback, { onFallback: hooks.onFallback });
}

/** Gemini alone (the live evals measure each provider on its own). */
export function createPrimaryModel(): LanguageModel {
  const env = agentEnv();
  return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(env.AGENT_MODEL);
}

/**
 * Claude (Haiku by default, FALLBACK_MODEL overrides) with thinking off: the stored history drops reasoning parts
 * between turns (run-turn.ts), and a fallback turn must also stay inside the chat route's time budget.
 */
export function createFallbackOnlyModel(): LanguageModel {
  const env = fallbackEnv();
  return wrapLanguageModel({
    model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.FALLBACK_MODEL),
    middleware: defaultSettingsMiddleware({ settings: { providerOptions: { anthropic: { thinking: { type: "disabled" } } } } }),
  });
}
