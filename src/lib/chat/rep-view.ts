import { RepFieldSchema, type RepField } from "@/lib/agent/schemas";
import type { Config } from "@/lib/config";
import { maxParticipation } from "@/lib/engine";
import type { ConversationSnapshot, RepQuestionRecord } from "./store";

/** Hebrew label of what the representative is asked for. Display text only. */
export const REP_FIELD_LABELS: Record<RepField, string> = {
  participation: "השתתפות עצמית ברכב",
  current: "הרכב הנוכחי וההשתתפות בו",
  group: "קבוצת זכאות",
  occupation: "עיסוק",
};

/**
 * What the rep screen shows for one open question: who is asking, which car, what is missing.
 * Only what the representative needs to answer: no salary, pension or tax data.
 */
export interface RepQuestionView {
  id: string;
  conversationId: string;
  shortId: string;
  createdAt: string;
  question: string;
  field: string;
  fieldLabel: string;
  /** false for legacy free-text questions: shown, but no form. */
  answerable: boolean;
  asker: {
    occupation?: string;
    group?: string;
    current?: { kind: "car" | "waiver"; label: string; carId?: string; participation?: number };
  };
  car?: { id: string; label: string; group: string; defaultParticipation: number; maxParticipation: number };
}

export function toRepQuestionView(q: RepQuestionRecord, snap: ConversationSnapshot, config: Config): RepQuestionView {
  const field = RepFieldSchema.safeParse(q.field);
  const p = snap.state.profile ?? {};
  const label = (id: string) => {
    const c = config.catalog.cars.find((x) => x.id === id);
    return c ? `${c.make} ${c.model}` : id;
  };

  const asker: RepQuestionView["asker"] = {};
  if (p.occupation) asker.occupation = p.occupation;
  if (p.group) asker.group = p.group;
  if (p.current) {
    asker.current =
      p.current.kind === "waiver"
        ? { kind: "waiver", label: "ויתור על רכב" }
        : { kind: "car", label: label(p.current.carId), carId: p.current.carId, participation: p.current.participation };
  }

  const car = q.carId ? config.catalog.cars.find((c) => c.id === q.carId) : undefined;
  return {
    id: q.id,
    conversationId: q.conversationId,
    shortId: q.conversationId.slice(0, 8),
    createdAt: q.createdAt,
    question: q.question,
    field: q.field,
    fieldLabel: field.success ? REP_FIELD_LABELS[field.data] : q.field,
    answerable: field.success && (field.data !== "participation" || car !== undefined),
    asker,
    car: car && {
      id: car.id,
      label: `${car.make} ${car.model}`,
      group: car.group,
      defaultParticipation: car.defaultParticipation,
      maxParticipation: maxParticipation(car, config.rules),
    },
  };
}
