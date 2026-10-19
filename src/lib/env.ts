import { z } from "zod";

const MIN_APP_SECRET = 32;
const MIN_REP_CODE = 8;

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
  FALLBACK_MODEL: z.string().min(1).optional(),
  /** HMAC key for the rep session cookie and the Realtime conversation topics (M7). */
  APP_SECRET: z.string().min(MIN_APP_SECRET).optional(),
  /** The rep screen's shared access code (M7, demo scope). */
  REP_ACCESS_CODE: z.string().min(MIN_REP_CODE).optional(),
  RATE_LIMIT_SCALE: z.string().optional(),
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

/** The fallback model (fallback-model.ts): Claude Haiku unless FALLBACK_MODEL says otherwise. */
const FallbackEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  FALLBACK_MODEL: z.string().min(1).default("claude-haiku-5-5"),
});

export function fallbackEnv() {
  return FallbackEnvSchema.parse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    FALLBACK_MODEL: process.env.FALLBACK_MODEL || undefined,
  });
}

/** APP_SECRET, required by the rep session and the conversation topics. A clear error instead of a weak default. */
export function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < MIN_APP_SECRET) throw new Error(`APP_SECRET must be set (at least ${MIN_APP_SECRET} characters, see .env.example)`);
  return secret;
}

/** Realtime polling fallback (src/lib/realtime/ping-fallback.ts). Raw values are passed in so this stays testable. */
const RealtimeEnvSchema = z.object({
  poll: z.enum(["on", "off"]).default("on"),
  fallbackMs: z.coerce.number().int().positive().default(5000),
  pollMs: z.coerce.number().int().positive().default(5000),
});

export function parseRealtimeEnv(raw: { poll?: string; fallbackMs?: string; pollMs?: string }) {
  const clean = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""));
  const env = RealtimeEnvSchema.parse(clean);
  return { pollEnabled: env.poll === "on", fallbackAfterMs: env.fallbackMs, pollMs: env.pollMs };
}

/** Browser-safe: NEXT_PUBLIC_* referenced literally so Next.js inlines them. */
export function realtimeEnv() {
  return parseRealtimeEnv({
    poll: process.env.NEXT_PUBLIC_REALTIME_POLL,
    fallbackMs: process.env.NEXT_PUBLIC_REALTIME_FALLBACK_MS,
    pollMs: process.env.NEXT_PUBLIC_REALTIME_POLL_MS,
  });
}

/**
 * What a deploy (Vercel) needs; next.config.ts fails the build with this list. Mock mode and e2e tagging are refused,
 * the keys must be there, and the rep code and app secret must not be trivially short.
 */
export function deployEnvProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const set = (name: string) => Boolean(env[name]?.trim());
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]) {
    if (!set(name)) problems.push(`${name} is not set`);
  }
  if (env.AGENT_MODEL === MOCK_MODEL) problems.push("AGENT_MODEL=mock is for local dev and e2e only");
  if (env.CONVERSATION_SOURCE === "e2e") problems.push("CONVERSATION_SOURCE=e2e is for the e2e server only");
  if ((env.REP_ACCESS_CODE ?? "").length < MIN_REP_CODE) problems.push(`REP_ACCESS_CODE must be at least ${MIN_REP_CODE} characters`);
  if ((env.APP_SECRET ?? "").length < MIN_APP_SECRET) problems.push(`APP_SECRET must be at least ${MIN_APP_SECRET} characters`);
  return problems;
}

export function assertDeployEnv(env: Record<string, string | undefined>): void {
  const problems = deployEnvProblems(env);
  if (problems.length) throw new Error(`Deploy env is not ready:\n- ${problems.join("\n- ")}`);
}
