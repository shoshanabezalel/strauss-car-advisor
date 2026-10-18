import "server-only";
import { createAgentModel, isMockMode } from "@/lib/agent/model";
import { loadConfig } from "@/lib/config";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseVouSource } from "@/lib/vou";
import { createSupabaseStore } from "./supabase-store";

/** Wiring for the API routes: Supabase store + value-of-use table + the configured model. */
export function chatDeps() {
  const config = loadConfig();
  const db = createAdminClient();
  return {
    config,
    store: createSupabaseStore(db),
    vouSource: createSupabaseVouSource(db, config.rules),
    source: serverEnv().CONVERSATION_SOURCE,
    createModel: createAgentModel,
  };
}

export const agentModeHeader = () => ({ "x-agent-mode": isMockMode() ? "mock" : "live" });
