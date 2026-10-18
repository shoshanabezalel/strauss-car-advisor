/**
 * When to refetch a screen: on every broadcast ping and on each (re)subscribe; and, as a fallback, by polling while
 * the Realtime channel is not subscribed (it did not come up within `fallbackAfterMs`, or it dropped). Pure state
 * machine over timers, so it is unit-tested with fake timers; use-ping.ts wires it to the Supabase channel.
 */

export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
/** connecting: waiting for the first subscribe · polling: fallback active · offline: not subscribed, fallback disabled. */
export type PingMode = "connecting" | "subscribed" | "polling" | "offline";

export interface PingFallbackOptions {
  onPing: () => void;
  onMode?: (mode: PingMode) => void;
  /** false in e2e, so a passing test proves Realtime delivered the update. */
  enabled: boolean;
  fallbackAfterMs: number;
  pollMs: number;
}

export interface PingFallback {
  status(s: ChannelStatus): void;
  /** A broadcast ping arrived. */
  ping(): void;
  dispose(): void;
  readonly mode: PingMode;
}

export function createPingFallback({ onPing, onMode, enabled, fallbackAfterMs, pollMs }: PingFallbackOptions): PingFallback {
  let mode: PingMode = "connecting";
  let disposed = false;
  let poll: ReturnType<typeof setInterval> | undefined;

  const setMode = (m: PingMode) => {
    if (m === mode) return;
    mode = m;
    onMode?.(m);
  };
  const stopPolling = () => {
    if (poll !== undefined) clearInterval(poll);
    poll = undefined;
  };
  const degrade = () => {
    if (disposed || mode === "subscribed" || mode === "polling") return;
    if (!enabled) return setMode("offline");
    setMode("polling");
    poll = setInterval(() => !disposed && onPing(), pollMs);
  };

  let firstTimeout: ReturnType<typeof setTimeout> | undefined = setTimeout(degrade, fallbackAfterMs);
  const clearFirst = () => {
    if (firstTimeout !== undefined) clearTimeout(firstTimeout);
    firstTimeout = undefined;
  };

  return {
    status(s) {
      if (disposed) return;
      clearFirst();
      if (s === "SUBSCRIBED") {
        stopPolling();
        setMode("subscribed");
        onPing(); // catch up on anything missed while not subscribed
        return;
      }
      if (mode === "subscribed") setMode("connecting");
      degrade();
    },
    ping() {
      if (!disposed) onPing();
    },
    dispose() {
      disposed = true;
      clearFirst();
      stopPolling();
    },
    get mode() {
      return mode;
    },
  };
}
