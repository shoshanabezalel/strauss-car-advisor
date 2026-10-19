import "server-only";
import { createAgentModel, isMockMode } from "@/lib/agent/model";
import { loadConfig } from "@/lib/config";
import { appSecret, serverEnv } from "@/lib/env";
import { createSupabaseNotifier } from "@/lib/realtime/supabase-notifier";
import { createSupabaseRateLimiter, rateLimitScale } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseVouSource } from "@/lib/vou";
import { createSupabaseStore } from "./supabase-store";

/** Wiring for the API routes: Supabase store + value-of-use table + Realtime pings + rate limits + the model. */
export function chatDeps() {
  const config = loadConfig();
  const db = createAdminClient();
  const env = serverEnv();
  return {
    config,
    store: createSupabaseStore(db),
    vouSource: createSupabaseVouSource(db, config.rules),
    notifier: createSupabaseNotifier(db, appSecret()),
    rateLimiter: createSupabaseRateLimiter(db),
    rateLimitScale: rateLimitScale(env.RATE_LIMIT_SCALE),
    source: env.CONVERSATION_SOURCE,
    createModel: createAgentModel,
  };
}

export const agentModeHeader = () => ({ "x-agent-mode": isMockMode() ? "mock" : "live" });
