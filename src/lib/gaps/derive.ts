import type { z } from "zod";
import type { CompareOptionsOutput, RepField } from "@/lib/agent/schemas";
import type { Config } from "@/lib/config";
import type { GapInput } from "./types";

/** One turn's tool calls and results, paired by id (runAgentTurn records both). */
export interface TurnRecord {
  toolCalls: { toolCallId?: string; toolName: string; input: unknown }[];
  toolOutputs: { toolCallId?: string; toolName: string; output: unknown }[];
}

type Compare = z.output<typeof CompareOptionsOutput>;

const REP_FIELD_TEXT: Record<RepField, string> = {
  participation: "השתתפות עצמית ברכב",
  current: "הרכב הנוכחי בפנייה",
  group: "קבוצת הזכאות",
  occupation: "העיסוק",
};
const DEFAULT_PARTICIPATION = "השתתפות עצמית לא אושרה ברכב: נעשה שימוש בברירת המחדל מהקטלוג";
const UNKNOWN_BY_NAME = "רכב שאינו בקטלוג (חיפוש לפי שם)";
const UNKNOWN_BY_CODES = "רכב שאינו בקטלוג (חיפוש לפי קודי יצרן ודגם)";
const MAX_VEHICLE = 60;

const tidy = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, MAX_VEHICLE);

/**
 * Gaps derived in code from one turn (TECH-DESIGN §7f). Only company data:
 * - a computed car option left on the catalog-default participation (needsConfirmation) → pending_confirmation
 *   (no question was sent; it waits for the car team);
 * - an askRepresentative call that went through → referred_to_rep, by its field (and car);
 * - a value-of-use search or lookup (the prompt uses them only for cars not in the catalog) → unknown_vehicle.
 * Missing employee data (salary, pension, children, credit points) is never a gap. Descriptions are fixed
 * templates: nothing the model or the employee wrote is copied, so no personal data can get in.
 */
export function deriveGaps(turn: TurnRecord, config: Config): GapInput[] {
  const carName = (id: string) => {
    const c = config.catalog.cars.find((x) => x.id === id);
    return c ? `${c.make} ${c.model}` : undefined;
  };
  const answered = new Set(turn.toolOutputs.map((o) => o.toolCallId).filter(Boolean));
  const gaps: GapInput[] = [];

  for (const { toolName, output } of turn.toolOutputs) {
    if (toolName !== "compareOptions") continue;
    for (const row of (output as Compare).options) {
      // Only when the employee actually got a net built on the catalog default (a computed row): a comparison that
      // is still waiting for the employee's own data relies on nothing yet.
      if (row.needsConfirmation && row.eligibility.eligible && row.situation.kind === "car" && row.missing.length === 0 && row.breakdown) {
        const carId = row.situation.carId;
        gaps.push({ type: "pending_confirmation", topic: `participation/${carId}`, description: DEFAULT_PARTICIPATION, vehicle: carName(carId) });
      }
    }
  }

  for (const call of turn.toolCalls) {
    if (!call.toolCallId || !answered.has(call.toolCallId)) continue; // rejected calls are not gaps
    const input = call.input as Record<string, unknown>;
    switch (call.toolName) {
      case "askRepresentative": {
        const field = input.field as RepField;
        const carId = typeof input.carId === "string" ? input.carId : undefined;
        gaps.push({
          type: "referred_to_rep",
          topic: field === "participation" && carId ? `participation/${carId}` : field,
          description: `הועברה שאלה לצוות הרכב: ${REP_FIELD_TEXT[field]}`,
          ...(carId && carName(carId) ? { vehicle: carName(carId) } : {}),
        });
        break;
      }
      case "searchValueOfUse": {
        const name = tidy(String(input.query ?? ""));
        if (name) gaps.push({ type: "unknown_vehicle", topic: `vehicle/${name.toLowerCase()}`, description: UNKNOWN_BY_NAME, vehicle: name });
        break;
      }
      case "getValueOfUse": {
        const make = String(input.makeCode ?? "");
        const model = String(input.modelCode ?? "");
        gaps.push({ type: "unknown_vehicle", topic: `vehicle/${make}-${model}`, description: UNKNOWN_BY_CODES, vehicle: `יצרן ${make} · דגם ${model}` });
        break;
      }
    }
  }

  const seen = new Set<string>();
  return gaps.filter((g) => {
    const key = `${g.type}|${g.topic}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
