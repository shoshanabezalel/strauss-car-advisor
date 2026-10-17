import { z } from "zod";

/** Public env — safe in the browser. Next.js inlines NEXT_PUBLIC_* only when referenced literally. */
const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/** Server-only env. */
const ServerEnvSchema = PublicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(), // required from M3
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
  return ServerEnvSchema.parse(process.env);
}
