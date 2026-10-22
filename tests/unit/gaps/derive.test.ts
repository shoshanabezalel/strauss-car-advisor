import { describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import type { EmployeeProfile } from "@/lib/engine";
import { deriveGaps, type TurnRecord } from "@/lib/gaps/derive";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../vou/fixture";

// G: gaps derived in code from one turn's tool calls and outputs. Company data only (user, 21/10): what only the
// employee can tell (salary, pension, children, credit points) is never a gap.
const config = loadConfig();
const e1 = config.employees.employees[0];
const atto = config.catalog.cars.find((c) => c.id === (e1.alternative as { carId: string }).carId)!;

function handlers(profile: EmployeeProfile = structuredClone(e1.profile)) {
  return createToolHandlers({ config, vouSource: createMemoryVouSource(loadVouRecords()), state: createAgentState(profile), repQueue: createMemoryRepQueue() });
}

/** One call with its result, paired by id as runAgentTurn records them. */
function turn(...entries: { toolName: string; input: unknown; output?: unknown }[]): TurnRecord {
  return {
    toolCalls: entries.map((e, i) => ({ toolCallId: `c${i}`, toolName: e.toolName, input: e.input })),
    toolOutputs: entries.flatMap((e, i) => (e.output === undefined ? [] : [{ toolCallId: `c${i}`, toolName: e.toolName, output: e.output }])),
  };
}

describe("deriveGaps", () => {
  it("a new car on the catalog-default participation → pending_confirmation for that car (no question was sent)", async () => {
    const input = { options: [{ kind: "car" as const, carId: atto.id }] };
    const output = await handlers().compareOptions(input);
    const gaps = deriveGaps(turn({ toolName: "compareOptions", input, output }), config);
    expect(gaps).toEqual([
      { type: "pending_confirmation", topic: `participation/${atto.id}`, description: expect.stringMatching(/[א-ת]/), vehicle: `${atto.make} ${atto.model}` },
    ]);
  });

  it("a car outside the employee's group logs no pending_confirmation", async () => {
    let checked = 0;
    for (const c of config.catalog.cars) {
      const input = { options: [{ kind: "car" as const, carId: c.id }] };
      const output = await handlers().compareOptions(input);
      const row = output.options[0];
      if (row.eligibility.eligible || !row.needsConfirmation) continue;
      checked++;
      expect(deriveGaps(turn({ toolName: "compareOptions", input, output }), config).filter((g) => g.type === "pending_confirmation")).toEqual([]);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("an askRepresentative call → referred_to_rep with its field (and car)", async () => {
    const h = handlers();
    const byCar = { question: "?", field: "participation" as const, carId: atto.id };
    const current = { question: "?", field: "current" as const };
    const gaps = deriveGaps(
      turn(
        { toolName: "askRepresentative", input: byCar, output: await h.askRepresentative(byCar) },
        { toolName: "askRepresentative", input: current, output: await h.askRepresentative(current) },
      ),
      config,
    );
    expect(gaps).toEqual([
      expect.objectContaining({ type: "referred_to_rep", topic: `participation/${atto.id}`, vehicle: `${atto.make} ${atto.model}` }),
      expect.objectContaining({ type: "referred_to_rep", topic: "current" }),
    ]);
    expect(gaps[1].vehicle).toBeUndefined();
  });

  it("a rejected askRepresentative call (no result) logs nothing", () => {
    const gaps = deriveGaps(turn({ toolName: "askRepresentative", input: { question: "?", field: "participation", carId: "CAR-99" } }), config);
    expect(gaps).toEqual([]);
  });

  it("a car looked up outside the catalog (search / value-of-use) → unknown_vehicle, keyed by the normalized name or codes", async () => {
    const h = handlers();
    const search = { query: "  פולקסווגן   ID.7 " };
    const vou = { makeCode: "00694", modelCode: "00001", regYear: 2025 };
    const gaps = deriveGaps(
      turn(
        { toolName: "searchValueOfUse", input: search, output: await h.searchValueOfUse(search) },
        { toolName: "getValueOfUse", input: vou, output: await h.getValueOfUse(vou) },
      ),
      config,
    );
    expect(gaps).toEqual([
      expect.objectContaining({ type: "unknown_vehicle", topic: "vehicle/פולקסווגן id.7", vehicle: "פולקסווגן ID.7" }),
      expect.objectContaining({ type: "unknown_vehicle", topic: "vehicle/00694-00001", vehicle: expect.stringContaining("00694") }),
    ]);
  });

  it("missing employee data (salary, pension, children, credit points) creates no gap", async () => {
    const input = { updates: [{ field: "group" as const, value: "ג", source: "employee" as const }] };
    const output = await handlers({}).updateProfile(input);
    expect(output.ok && output.missing.length).toBeGreaterThan(0);
    const compareInput = { options: [{ kind: "car" as const, carId: atto.id }] };
    const compare = await handlers({ group: "ג" }).compareOptions(compareInput);
    const gaps = deriveGaps(turn({ toolName: "updateProfile", input, output }, { toolName: "compareOptions", input: compareInput, output: compare }), config);
    expect(gaps).toEqual([]);
  });

  it("the same gap twice in a turn is logged once", async () => {
    const input = { options: [{ kind: "car" as const, carId: atto.id }] };
    const output = await handlers().compareOptions(input);
    const gaps = deriveGaps(turn({ toolName: "compareOptions", input, output }, { toolName: "compareOptions", input, output }), config);
    expect(gaps).toHaveLength(1);
  });

  it("no personal data: none of the profile's values or the occupation appears in a gap", async () => {
    const input = { options: [{ kind: "car" as const, carId: atto.id }, { kind: "waiver" as const }] };
    const h = handlers();
    const ask = { question: `שכר ${e1.profile.baseSalary}`, field: "participation" as const, carId: atto.id };
    const json = JSON.stringify(
      deriveGaps(
        turn({ toolName: "compareOptions", input, output: await h.compareOptions(input) }, { toolName: "askRepresentative", input: ask, output: await h.askRepresentative(ask) }),
        config,
      ),
    );
    for (const v of [e1.profile.baseSalary, e1.profile.commissions, e1.profile.bonus].filter((n) => n && n > 0)) expect(json).not.toContain(String(v));
    expect(json).not.toContain(e1.profile.occupation!);
    // the rep question's free text (which may quote the employee) is never copied into a gap
    expect(json).not.toContain("שכר");
  });
});
