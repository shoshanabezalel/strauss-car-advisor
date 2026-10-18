import type { Car } from "@/lib/config";
import type { MissingField } from "@/lib/engine";
import type { VouRecord } from "@/lib/vou";
import type { z } from "zod";
import type { CompareOptionsOutput, GetValueOfUseOutput, RepField, UpdateProfileOutput } from "./schemas";

export interface ToolOutput {
  toolName: string;
  output: unknown;
}

/** Structured flags the UI shows regardless of how the model words its reply. */
export type Notice =
  | { kind: "missing"; fields: MissingField[] }
  | { kind: "participation_unconfirmed"; carId: Car["id"] }
  | { kind: "ambiguous_vou"; candidates: VouRecord[] }
  | { kind: "confirm_vou_match"; record: VouRecord }
  | { kind: "rep_question_open"; questionId: string }
  /** Added by the representative-answer service (src/lib/chat/rep-answer.ts), not derived from agent tools. */
  | { kind: "rep_answered"; questionId: string; field: RepField };

type Compare = z.output<typeof CompareOptionsOutput>;
type Update = z.output<typeof UpdateProfileOutput>;
type Vou = z.output<typeof GetValueOfUseOutput>;

/**
 * Derive notices from one turn's tool outputs (already Zod-checked by the tools). Missing fields come from the
 * latest output that reports them, since later calls supersede earlier ones within the turn.
 */
export function deriveNotices(outputs: readonly ToolOutput[]): Notice[] {
  const notices: Notice[] = [];
  let missing: MissingField[] | undefined;

  for (const { toolName, output } of outputs) {
    switch (toolName) {
      case "compareOptions": {
        const c = output as Compare;
        const rows = [c.today, ...c.options];
        missing = [...new Set(rows.flatMap((r) => r.missing))];
        for (const r of c.options) {
          if (r.needsConfirmation && r.situation.kind === "car") {
            notices.push({ kind: "participation_unconfirmed", carId: r.situation.carId });
          }
        }
        break;
      }
      case "updateProfile": {
        const u = output as Update;
        if (u.ok) missing = u.missing;
        break;
      }
      case "getValueOfUse": {
        const v = output as Vou;
        if (v.status === "ambiguous") notices.push({ kind: "ambiguous_vou", candidates: v.candidates });
        if (v.status === "found" && v.mustConfirm) notices.push({ kind: "confirm_vou_match", record: v.record });
        break;
      }
      case "askRepresentative":
        notices.push({ kind: "rep_question_open", questionId: (output as { questionId: string }).questionId });
        break;
    }
  }

  if (missing?.length) notices.unshift({ kind: "missing", fields: missing });
  return dedupe(notices);
}

function dedupe(notices: Notice[]): Notice[] {
  const seen = new Set<string>();
  return notices.filter((n) => {
    const k = JSON.stringify(n);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
