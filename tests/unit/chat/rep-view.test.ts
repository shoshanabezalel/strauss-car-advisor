import { describe, expect, it } from "vitest";
import { createAgentState, REP_FIELDS } from "@/lib/agent";
import type { ConversationSnapshot, RepQuestionRecord } from "@/lib/chat/store";
import { REP_FIELD_LABELS, toRepQuestionView } from "@/lib/chat/rep-view";
import { loadConfig } from "@/lib/config";
import { maxParticipation } from "@/lib/engine";

const config = loadConfig();
const e1 = config.employees.employees[0];
const atto = config.catalog.cars.find((c) => c.model === "ATTO 3")!;
const corolla = config.catalog.cars.find((c) => e1.profile.current.kind === "car" && c.id === e1.profile.current.carId)!;

const question = (over: Partial<RepQuestionRecord> = {}): RepQuestionRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  conversationId: "11111111-2222-4333-8444-555555555555",
  field: "participation",
  carId: atto.id,
  question: "מה ההשתתפות העצמית ב-ATTO 3?",
  context: {},
  status: "open",
  createdAt: "2026-10-22T08:00:00.000Z",
  ...over,
});

const snapshot = (profile = e1.profile): ConversationSnapshot => ({
  id: "11111111-2222-4333-8444-555555555555",
  status: "waiting_rep",
  state: createAgentState(structuredClone(profile)),
  messages: [],
  repQuestions: [],
});

describe("toRepQuestionView", () => {
  it("who is asking, which car, what is missing", () => {
    const v = toRepQuestionView(question(), snapshot(), config);
    expect(v).toMatchObject({
      id: question().id,
      conversationId: question().conversationId,
      shortId: "11111111",
      field: "participation",
      fieldLabel: REP_FIELD_LABELS.participation,
      answerable: true,
      question: question().question,
      asker: { occupation: e1.profile.occupation, group: e1.profile.group, current: { kind: "car", label: `${corolla.make} ${corolla.model}` } },
      car: {
        id: atto.id,
        label: `${atto.make} ${atto.model}`,
        group: atto.group,
        defaultParticipation: atto.defaultParticipation,
        maxParticipation: maxParticipation(atto, config.rules),
      },
    });
  });

  it("never exposes salary data to the representative", () => {
    const json = JSON.stringify(toRepQuestionView(question(), snapshot(), config));
    for (const key of ["baseSalary", "commissions", "bonus", "pensionPct", "studyFundPct", "creditPoints"]) expect(json).not.toContain(key);
    expect(json).not.toContain(String(e1.profile.baseSalary));
  });

  it("an empty profile still renders (A12: nothing known yet)", () => {
    const v = toRepQuestionView(question({ field: "current", carId: undefined }), snapshot({} as never), config);
    expect(v).toMatchObject({ field: "current", answerable: true, asker: {} });
    expect(v.car).toBeUndefined();
  });

  it("a legacy free-text field is shown but not answerable", () => {
    const v = toRepQuestionView(question({ field: "something", carId: undefined }), snapshot(), config);
    expect(v.answerable).toBe(false);
  });

  it("every rep field has a Hebrew label", () => {
    for (const f of REP_FIELDS) expect(REP_FIELD_LABELS[f]).toMatch(/[֐-׿]/);
  });
});
