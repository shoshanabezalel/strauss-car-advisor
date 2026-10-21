import type { Config } from "@/lib/config";
import { deriveGaps, type TurnRecord } from "./derive";
import type { GapInput } from "./types";

/** The part of the conversation store gap recording needs. */
interface GapStore {
  recordGaps(conversationId: string, gaps: GapInput[]): Promise<void>;
}

/**
 * Record a turn's gaps (deriveGaps). Bookkeeping for Strauss, never part of the employee's answer: a failure is
 * logged and swallowed, so the turn itself never fails because of it.
 */
export async function recordTurnGaps(store: GapStore, conversationId: string, turn: TurnRecord, config: Config): Promise<void> {
  try {
    const gaps = deriveGaps(turn, config);
    if (gaps.length) await store.recordGaps(conversationId, gaps);
  } catch (err) {
    console.warn("[gaps] could not record information gaps", (err as Error)?.message ?? err);
  }
}
