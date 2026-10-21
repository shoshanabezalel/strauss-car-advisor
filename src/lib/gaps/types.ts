import { z } from "zod";

/**
 * Information gaps (מאגר פערי מידע, TECH-DESIGN §7f): what the system could not answer from real data, so Strauss can
 * see what is missing from the catalog and the rules. Company data only: what only the employee can tell (salary,
 * pension, children, credit points) is normal chat, never a gap. No personal data is stored.
 */
export const GAP_TYPES = ["no_data", "referred_to_rep", "unknown_vehicle"] as const;
export type GapType = (typeof GAP_TYPES)[number];

/** Topics the agent may give a no_data gap (an enum, so free text never becomes a grouping key). */
export const GAP_TOPICS = ["rules", "tax", "electric", "family", "waiver", "eligibility", "process", "other"] as const;
export type GapTopic = (typeof GAP_TOPICS)[number];

/** The agent's logInformationGap input: a short neutral description, no digits (no salaries, amounts or ids). */
export const LogInformationGapInput = z.object({
  topic: z.enum(GAP_TOPICS),
  description: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .refine((s) => !/\d/.test(s), { message: "no digits: describe the missing information, not the employee's numbers" })
    .refine((s) => /[א-ת]/.test(s) && !/[A-Za-z]/.test(s), { message: "in Hebrew only: the rep screen shows it as is" }),
});
export const LogInformationGapOutput = z.object({ ok: z.literal(true) });

export interface GapInput {
  type: GapType;
  /** Grouping key with `type`: a field (`current`), `participation/<carId>`, `vehicle/<name or codes>`, or a GAP_TOPICS value. */
  topic: string;
  /** Short, neutral, from a fixed template (code) or the agent's checked description. */
  description: string;
  /** Make / model or the searched name, when the gap is about a car. */
  vehicle?: string;
}

/** One stored row: one per (conversation, type, topic). */
export interface GapRow extends GapInput {
  conversationId: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface GapStatus {
  type: GapType;
  topic: string;
  resolvedAt: string;
}

/** What the rep screen shows: one line per (type, topic). */
export interface GapGroup extends GapInput {
  /** Conversations that hit this gap. */
  count: number;
  lastSeen: string;
  /** טופל, until the gap shows up again. */
  resolved: boolean;
}

/** Where the agent's logInformationGap writes (bound to one conversation, like RepQueue). */
export interface GapLog {
  log(gap: GapInput): Promise<void>;
}

export const noopGapLog: GapLog = { async log() {} };

/** Unit tests and evals. */
export function createMemoryGapLog(): GapLog & { gaps: GapInput[] } {
  const gaps: GapInput[] = [];
  return {
    gaps,
    async log(gap) {
      gaps.push(gap);
    },
  };
}
