"use client";

import { useEffect, useRef, useState } from "react";
import { realtimeEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { createPingFallback, type ChannelStatus, type PingMode } from "./ping-fallback";
import { PING_EVENT } from "./topics";

/**
 * Calls `onPing` when the server pings `topic` (public broadcast, no data), on each (re)subscribe, and by polling
 * while the channel is down (ping-fallback.ts). Returns the mode for `data-realtime` (e2e checks it).
 */
export function usePing(topic: string | undefined, onPing: () => void): PingMode {
  // Keyed by topic, so a new topic starts as "connecting" without resetting state inside the effect.
  const [state, setState] = useState<{ topic?: string; mode: PingMode }>({ mode: "connecting" });
  const latest = useRef(onPing);
  useEffect(() => {
    latest.current = onPing;
  });

  useEffect(() => {
    if (!topic) return;
    const env = realtimeEnv();
    const fallback = createPingFallback({
      onPing: () => latest.current(),
      onMode: (mode) => setState({ topic, mode }),
      enabled: env.pollEnabled,
      fallbackAfterMs: env.fallbackAfterMs,
      pollMs: env.pollMs,
    });
    const supabase = createClient();
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: PING_EVENT }, () => fallback.ping())
      .subscribe((status) => fallback.status(status as ChannelStatus));
    return () => {
      fallback.dispose();
      void supabase.removeChannel(channel);
    };
  }, [topic]);

  return state.topic === topic ? state.mode : "connecting";
}
