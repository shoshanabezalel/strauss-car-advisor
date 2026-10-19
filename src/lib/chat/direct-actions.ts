import { z } from "zod";
import { AgentSituationSchema, createToolHandlers, ProfileFieldSchema, type ProfileField } from "@/lib/agent";
import { DIRECT_FALLBACK, optionsReply, profileUpdatedReply } from "@/lib/agent/replies";
import type { Config, Situation } from "@/lib/config";
import { missingProfileFields } from "@/lib/engine";
import { ownsConversation } from "@/lib/security/owner";
import { FIELD_LABELS } from "@/lib/format/labels";
import type { Notifier } from "@/lib/realtime/notifier";
import type { VouSource } from "@/lib/vou";
import { persistDirectTurn, type ToolCallRecord } from "./direct-turn";
import { lockedFields } from "./profile-view";
import { recompute } from "./rep-answer";
import type { CompareOutput, ConversationSnapshot, ConversationSource, ConversationStore } from "./store";

/**
 * F5: the employee edits the profile or picks cars from the screen. The same tools as the agent (origin "agent",
 * source "employee"), the engine recomputes, the reply is built in code and guarded. No LLM.
 */

export type DirectError = "not_found" | "invalid" | "locked" | "incomplete" | "failed";
export type DirectResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: DirectError; message: string; options?: string[]; fields?: string[] };

/** HTTP status per error, for /api/profile and /api/compare. */
export const DIRECT_STATUS: Record<DirectError, number> = { not_found: 404, invalid: 422, locked: 409, incomplete: 422, failed: 500 };

interface Deps {
  store: ConversationStore;
  config: Config;
  vouSource: VouSource;
  notifier: Notifier;
  source: ConversationSource;
  /** SHA-256 of the caller's owner cookie (M7). */
  ownerHash: string;
}

/** What the client may send: a field and a value. The source is always "employee", set here. */
export const ProfileEditSchema = z.array(z.object({ field: ProfileFieldSchema, value: z.unknown() })).min(1).max(10);
/** 1–3 options. A car's participation is never taken from the client: the tool fills the rep answer or the default. */
export const OptionsEditSchema = z.array(AgentSituationSchema).min(1).max(3);

const fail = (error: DirectError, message: string, extra: { options?: string[]; fields?: string[] } = {}): DirectResult => ({ ok: false, error, message, ...extra });
const NOT_FOUND = "לא מצאתי את השיחה הזו. אפשר להתחיל שיחה חדשה.";
const FAILED = "משהו השתבש ולא הצלחתי לשמור. אפשר לנסות שוב.";
const label = (f: string) => FIELD_LABELS[f as ProfileField] ?? f;

/** The caller's conversation, or a new one. Someone else's (or a pre-M7 one without owner) → null, like a missing one. */
async function open(deps: Deps, conversationId: string | undefined): Promise<ConversationSnapshot | null> {
  const id = conversationId ?? (await deps.store.create(deps.source, deps.ownerHash));
  const snap = await deps.store.load(id);
  return snap && ownsConversation(snap, deps.ownerHash) ? snap : null;
}

export async function updateProfileDirect(input: Deps & { conversationId?: string; updates: unknown }): Promise<DirectResult> {
  const { store, config, vouSource, notifier } = input;
  const edits = ProfileEditSchema.safeParse(input.updates);
  if (!edits.success) return fail("invalid", "הפרטים לא תקינים.");

  const snap = await open(input, input.conversationId);
  if (!snap) return fail("not_found", NOT_FOUND);
  const id = snap.id;
  const state = snap.state;

  const locked = lockedFields(state).filter((f) => edits.data.some((e) => e.field === f));
  if (locked.length) {
    return fail("locked", `${locked.map(label).join(", ")} אושר/ו על ידי נציג/ת הרכב ואי אפשר לשנות כאן. אפשר לכתוב בשיחה.`, { fields: locked });
  }

  // A current car from the client carries no participationSource: the tool marks it as the employee's.
  const updates = [];
  for (const e of edits.data) {
    if (e.field !== "current") {
      updates.push({ field: e.field, value: e.value, source: "employee" });
      continue;
    }
    const s = AgentSituationSchema.safeParse(e.value);
    if (!s.success) return fail("invalid", "המצב היום לא תקין.", { fields: ["current"] });
    updates.push({ field: e.field, value: s.data, source: "employee" });
  }

  try {
    const tools = createToolHandlers({ config, vouSource, state, repQueue: store.repQueue(id) });
    const parsedInput = { updates } as Parameters<typeof tools.updateProfile>[0];
    let output;
    try {
      output = await tools.updateProfile(parsedInput);
    } catch {
      return fail("invalid", "אחד הערכים לא תקין (למשל מספר שלילי או אחוז מעל מאה).");
    }
    if (!output.ok) {
      const err = output.errors[0];
      return fail("invalid", `${label(err.field)}: הערך לא מוכר. אפשר לבחור מהרשימה.`, { options: err.options, fields: output.errors.map((x) => x.field) });
    }
    const calls: ToolCallRecord[] = [{ toolName: "updateProfile", input: parsedInput, output }];
    let compared: CompareOutput | undefined;
    if (snap.comparison) {
      const r = await recompute(tools, snap.comparison);
      compared = r.output;
      calls.push({ toolName: "compareOptions", input: r.input, output: compared });
    }
    await persistDirectTurn({
      store,
      config,
      notifier,
      conversationId: id,
      callIdPrefix: `edit-${crypto.randomUUID()}`,
      state,
      calls,
      compared,
      reply: profileUpdatedReply({ fields: [...new Set(edits.data.map((e) => label(e.field)))], compare: compared, missing: output.missing.map(label), config }),
      fallback: DIRECT_FALLBACK,
    });
    return { ok: true, conversationId: id };
  } catch (err) {
    console.error("[direct] profile update failed", err);
    return fail("failed", FAILED);
  }
}

export async function changeOptions(input: Deps & { conversationId: string; options: unknown }): Promise<DirectResult> {
  const { store, config, vouSource, notifier } = input;
  const parsed = OptionsEditSchema.safeParse(input.options);
  if (!parsed.success) return fail("invalid", "אפשר להשוות בין אפשרות אחת לשלוש.");
  const options: Situation[] = parsed.data.map((o) => (o.kind === "car" ? { kind: "car", carId: o.carId } : o));
  if (options.some((o) => o.kind === "car" && !config.catalog.cars.some((c) => c.id === o.carId))) {
    return fail("invalid", "הרכב לא נמצא בקטלוג.");
  }

  const snap = await open(input, input.conversationId);
  if (!snap) return fail("not_found", NOT_FOUND);
  const state = snap.state;
  const missing = missingProfileFields(state.profile, config);
  if (missing.length) return fail("incomplete", `כדי להשוות חסרים עוד: ${missing.map(label).join(", ")}.`, { fields: missing });

  try {
    const tools = createToolHandlers({ config, vouSource, state, repQueue: store.repQueue(snap.id) });
    const compareInput = { options };
    const compared = await tools.compareOptions(compareInput);
    await persistDirectTurn({
      store,
      config,
      notifier,
      conversationId: snap.id,
      callIdPrefix: `edit-${crypto.randomUUID()}`,
      state,
      calls: [{ toolName: "compareOptions", input: compareInput, output: compared }],
      compared,
      reply: optionsReply(compared, config),
      fallback: DIRECT_FALLBACK,
    });
    return { ok: true, conversationId: snap.id };
  } catch (err) {
    console.error("[direct] options change failed", err);
    return fail("failed", FAILED);
  }
}
