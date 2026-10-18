import { z } from "zod";

/** Public env — safe in the browser. Next.js inlines NEXT_PUBLIC_* only when referenced literally. */
const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/** Server-only env. */
const ServerEnvSchema = PublicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(), // required by agentEnv()
  AGENT_MODEL: z.string().min(1).optional(),
  /** Tag for new conversations; the e2e server sets "e2e" so `npm run db:clean-e2e` can remove them. */
  CONVERSATION_SOURCE: z.enum(["app", "e2e"]).default("app"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(), // optional LLM fallback
  // Used only by the Supabase MCP (scripts/supabase-mcp.mjs reads it from .env.local); the app never reads it.
  SUPABASE_ACCESS_TOKEN: z.string().optional(),
});

export function publicEnv() {
  return PublicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function serverEnv() {
  // Empty lines copied from .env.example (`AGENT_MODEL=`) mean "not set".
  return ServerEnvSchema.parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== "")));
}

/** AGENT_MODEL value that selects the scripted model (src/lib/agent/mock-model.ts). */
export const MOCK_MODEL = "mock";

/** What the live agent model needs. Separate from serverEnv so evals can run without the Supabase keys. */
const AgentEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  AGENT_MODEL: z.string().min(1).default("gemini-3.5-flash"),
});

export function agentEnv() {
  return AgentEnvSchema.parse({
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined,
    AGENT_MODEL: process.env.AGENT_MODEL || undefined,
  });
}
