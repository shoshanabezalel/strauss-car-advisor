import { beforeEach, describe, expect, it } from "vitest";
import { AskRepresentativeInput, createAgentState, createMemoryRepQueue, createToolHandlers, RepAnswerSchema, type AgentDeps } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { compareOptions } from "@/lib/engine";
import { createMemoryVouSource } from "@/lib/vou";

// M5: only the representative path may use the "rep" source; the LLM-facing tools cannot fake a confirmation.
const config = loadConfig();
const e1 = config.employees.employees[0];
const atto = config.catalog.cars.find((c) => c.model === "ATTO 3")!;

let deps: AgentDeps & { repQueue: ReturnType<typeof createMemoryRepQueue> };
beforeEach(() => {
  deps = { config, vouSource: createMemoryVouSource([]), state: createAgentState(structuredClone(e1.profile)), repQueue: createMemoryRepQueue() };
});

describe("agent origin (the LLM's tools)", () => {
  it("updateProfile rejects source rep", async () => {
    await expect(createToolHandlers(deps).updateProfile({ updates: [{ field: "bonus", value: 1, source: "rep" }] })).rejects.toThrow();
    expect(deps.state.profile.bonus).toBe(e1.profile.bonus);
  });

  it("compareOptions rejects a participationSource sent by the model", async () => {
    const tools = createToolHandlers(deps);
    for (const participationSource of ["rep", "catalog_default", "employee"] as const) {
      await expect(
        tools.compareOptions({ options: [{ kind: "car", carId: atto.id, participation: 999, participationSource }] }),
      ).rejects.toThrow();
    }
  });

  it("a participation the model passes is a statement, not a rep confirmation", async () => {
    const out = await createToolHandlers(deps).compareOptions({ options: [{ kind: "car", carId: atto.id, participation: 300 }] });
    expect(out.options[0].participationSource).not.toBe("rep");
    expect(out.options[0]).toMatchObject({ participation: 300, needsConfirmation: false });
  });

  it("an option without participation still takes the catalog default", async () => {
    const out = await createToolHandlers(deps).compareOptions({ options: [{ kind: "car", carId: atto.id }] });
    expect(out.options[0]).toMatchObject({ participation: atto.defaultParticipation, participationSource: "catalog_default", needsConfirmation: true });
  });
});

describe("rep origin", () => {
  it("updateProfile accepts source rep and marks the current-car participation as rep", async () => {
    const current = e1.profile.current;
    if (current.kind !== "car") throw new Error("E-001 has a car");
    const out = await createToolHandlers(deps, { origin: "rep" }).updateProfile({
      updates: [{ field: "current", value: { ...current, participation: 350 }, source: "rep" }],
    });
    expect(out.ok).toBe(true);
    expect(deps.state.sources.current).toBe("rep");
    expect(deps.state.profile.current).toMatchObject({ participation: 350, participationSource: "rep" });
  });
});

describe("rep-confirmed participation in state", () => {
  it("fills an option without participation, for either origin, and clears needsConfirmation", async () => {
    deps.state.repParticipation = { [atto.id]: 350 };
    const expected = compareOptions(
      e1.profile,
      [{ kind: "car", carId: atto.id, participation: 350, participationSource: "rep" }],
      config,
    ).options[0];
    for (const origin of ["agent", "rep"] as const) {
      const out = await createToolHandlers(deps, { origin }).compareOptions({ options: [{ kind: "car", carId: atto.id }] });
      expect(out.options[0]).toMatchObject({ participation: 350, participationSource: "rep", needsConfirmation: false });
      expect(out.options[0].breakdown?.net).toBe(expected.breakdown?.net);
    }
  });

  it("does not touch other cars", async () => {
    deps.state.repParticipation = { [atto.id]: 350 };
    const other = config.catalog.cars.find((c) => c.group === atto.group && c.id !== atto.id && c.id !== (e1.profile.current.kind === "car" ? e1.profile.current.carId : ""))!;
    const out = await createToolHandlers(deps).compareOptions({ options: [{ kind: "car", carId: other.id }] });
    expect(out.options[0]).toMatchObject({ participationSource: "catalog_default", needsConfirmation: true });
  });
});

describe("askRepresentative is structured", () => {
  it("participation needs a catalog car id", async () => {
    const tools = createToolHandlers(deps);
    await expect(tools.askRepresentative({ question: "?", field: "participation" })).rejects.toThrow();
    await expect(tools.askRepresentative({ question: "?", field: "participation", carId: "CAR-99" })).rejects.toThrow();
    const out = await tools.askRepresentative({ question: "?", field: "participation", carId: atto.id });
    expect(out.status).toBe("open");
    expect(deps.repQueue.questions[0]).toMatchObject({ field: "participation", carId: atto.id });
  });

  it("free-text fields are rejected; current / group / occupation need no car", async () => {
    expect(AskRepresentativeInput.safeParse({ question: "?", field: "salary" }).success).toBe(false);
    for (const field of ["current", "group", "occupation"]) {
      expect(AskRepresentativeInput.safeParse({ question: "?", field }).success).toBe(true);
    }
  });

  it("answers are typed per field", () => {
    expect(RepAnswerSchema.safeParse({ field: "participation", carId: atto.id, value: 350 }).success).toBe(true);
    expect(RepAnswerSchema.safeParse({ field: "participation", carId: atto.id, value: -1 }).success).toBe(false);
    expect(RepAnswerSchema.safeParse({ field: "participation", carId: atto.id, value: "350" }).success).toBe(false);
    expect(RepAnswerSchema.safeParse({ field: "current", situation: { kind: "waiver" } }).success).toBe(true);
    expect(RepAnswerSchema.safeParse({ field: "group", value: "ג" }).success).toBe(true);
    expect(RepAnswerSchema.safeParse({ field: "note", value: "x" }).success).toBe(false);
  });
});
