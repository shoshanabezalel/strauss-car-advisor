import { beforeEach, describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers, type AgentDeps } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { allowedCars, checkEligibility, compareOptions, missingProfileFields } from "@/lib/engine";
import { displayDiff, roundShekel } from "@/lib/format/money";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../vou/fixture";

const config = loadConfig();
const employees = config.employees.employees;
const vouSource = createMemoryVouSource(loadVouRecords());
const car = (model: string) => config.catalog.cars.find((c) => c.model === model)!;

let deps: AgentDeps & { repQueue: ReturnType<typeof createMemoryRepQueue> };
beforeEach(() => {
  deps = { config, vouSource, state: createAgentState(), repQueue: createMemoryRepQueue() };
});
const tools = () => createToolHandlers(deps);
const strip = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "display"));

describe("compareOptions tool", () => {
  it.each(employees.map((e) => [e.id, e] as const))("%s: wraps the engine and adds sheet-equal display values", async (_id, e) => {
    deps.state = createAgentState(e.profile);
    const out = await tools().compareOptions({ options: [e.alternative] });
    const engine = compareOptions(e.profile, [e.alternative], config);

    expect(strip(out.today)).toEqual(engine.today);
    expect(strip(out.options[0])).toEqual(engine.options[0]);
    expect(out.today.display.net).toBe(e.expected.netToday);
    expect(out.options[0].display.net).toBe(e.expected.netAlt);
    expect(out.options[0].display.diffVsToday).toBe(e.expected.diff);
    // display comes from the existing formatters, not new arithmetic
    expect(out.options[0].display.diffVsToday).toBe(
      displayDiff(engine.options[0].breakdown!.net, engine.today.breakdown!.net),
    );
    expect(out.today.display.net).toBe(roundShekel(engine.today.breakdown!.net));
    // the sign as a word, so the model never has to read a minus sign
    const d = e.expected.diff;
    expect(out.options[0].display.direction).toBe(d > 0 ? "up" : d < 0 ? "down" : "none");
  });

  it.each(employees.map((e) => [e.id, e] as const))("%s: display carries every table amount, rounded from the engine", async (_id, e) => {
    deps.state = createAgentState(e.profile);
    const out = await tools().compareOptions({ options: [e.alternative] });
    for (const row of [out.today, out.options[0]]) {
      expect(row.display).toMatchObject({
        valueOfUse: roundShekel(row.valueOfUse),
        participation: roundShekel(row.participation),
        carCost: roundShekel(row.carCost),
        electricGross: roundShekel(row.electricGross),
        maintenance: roundShekel(row.maintenance),
        familyGapEmployee: roundShekel(row.familyGapEmployee),
      });
      expect(row.display.budget).toBe(row.budget === undefined ? undefined : roundShekel(row.budget));
    }
    expect(out.options[0].display.electricGross).toBe(e.expected.electricGross);
    expect(out.options[0].display.familyGapEmployee).toBe(e.expected.familyGapEmployee);
  });

  it("flags a catalog-default participation as needing confirmation", async () => {
    const e = employees[0];
    deps.state = createAgentState(e.profile);
    const out = await tools().compareOptions({ options: [{ kind: "car", carId: e.alternative.kind === "car" ? e.alternative.carId : "" }] });
    expect(out.options[0].needsConfirmation).toBe(true);
    expect(out.options[0].participationSource).toBe("catalog_default");
  });

  it("returns missing[] and no display net when the profile is incomplete", async () => {
    deps.state = createAgentState({ group: "ג" });
    const out = await tools().compareOptions({ options: [{ kind: "car", carId: car("ATTO 3").id }] });
    expect(out.options[0].missing.length).toBeGreaterThan(0);
    expect(out.options[0].display.net).toBeUndefined();
    expect(out.today.display.net).toBeUndefined();
  });

  it("rejects invalid input", async () => {
    await expect(tools().compareOptions({ options: [] })).rejects.toThrow();
    // @ts-expect-error invalid situation kind
    await expect(tools().compareOptions({ options: [{ kind: "bike" }] })).rejects.toThrow();
  });
});

describe("updateProfile tool", () => {
  it("converts percent input to a fraction and records sources", async () => {
    const out = await tools().updateProfile({
      updates: [
        { field: "pensionPct", value: 6, source: "employee" },
        { field: "studyFundPct", value: 2.5, source: "employee" },
        { field: "baseSalary", value: 14200, source: "employee" },
      ],
    });
    expect(out.ok).toBe(true);
    expect(deps.state.profile.pensionPct).toBeCloseTo(0.06, 12);
    expect(deps.state.profile.studyFundPct).toBeCloseTo(0.025, 12);
    expect(deps.state.profile.baseSalary).toBe(14200);
    expect(deps.state.sources).toMatchObject({ pensionPct: "employee", baseSalary: "employee" });
  });

  it("returns the engine's missing fields", async () => {
    const out = await tools().updateProfile({ updates: [{ field: "group", value: "ג", source: "employee" }] });
    expect(out.ok && out.missing).toEqual(missingProfileFields(deps.state.profile, config));
    expect(out.ok && out.missing).toContain("baseSalary");
    expect(out.ok && out.missing).not.toContain("group");
  });

  it("replaces the profile object instead of mutating it", async () => {
    const before = deps.state.profile;
    await tools().updateProfile({ updates: [{ field: "bonus", value: 0, source: "employee" }] });
    expect(deps.state.profile).not.toBe(before);
    expect(before).toEqual({});
  });

  it("rejects an unknown group, occupation or car and applies nothing", async () => {
    const out = await tools().updateProfile({
      updates: [
        { field: "baseSalary", value: 10000, source: "employee" },
        { field: "group", value: "ז", source: "employee" },
        { field: "occupation", value: "אסטרונאוט", source: "employee" },
        { field: "current", value: { kind: "car", carId: "CAR-99" }, source: "employee" },
      ],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.map((x) => x.error)).toEqual(["unknown_group", "unknown_occupation", "unknown_car"]);
    expect(out.errors[0].options).toEqual(config.rules.groupOrder);
    expect(out.errors[1].options).toContain("מפתח/ת תוכנה");
    expect(deps.state.profile).toEqual({});
  });

  it("rejects out-of-range values", async () => {
    await expect(tools().updateProfile({ updates: [{ field: "pensionPct", value: 600, source: "employee" }] })).rejects.toThrow();
    await expect(tools().updateProfile({ updates: [{ field: "baseSalary", value: -1, source: "employee" }] })).rejects.toThrow();
    await expect(
      // @ts-expect-error catalog_default is not a profile source
      tools().updateProfile({ updates: [{ field: "bonus", value: 1, source: "catalog_default" }] }),
    ).rejects.toThrow();
  });

  it("stamps the update source on a stated current-car participation", async () => {
    const id = car("COROLLA CROSS").id;
    await tools().updateProfile({
      updates: [{ field: "current", value: { kind: "car", carId: id, participation: 300 }, source: "employee" }],
    });
    expect(deps.state.profile.current).toEqual({ kind: "car", carId: id, participation: 300, participationSource: "employee" });
  });
});

describe("getCatalog / checkEligibility tools", () => {
  it("getCatalog wraps allowedCars on the current profile", async () => {
    deps.state = createAgentState({ group: "ב", childrenUnder23: 1 });
    expect(await tools().getCatalog({})).toEqual(allowedCars(deps.state.profile, config));
  });

  it("getCatalog scope all lists the whole catalog for name → id lookup, before the profile is known", async () => {
    expect(await tools().getCatalog({ scope: "all" })).toEqual({ cars: config.catalog.cars, missing: [] });
  });

  it("getCatalog reports a missing group", async () => {
    expect(await tools().getCatalog({})).toEqual({ cars: [], missing: ["group"] });
  });

  it("checkEligibility wraps the engine (A10: group ג asking for a group ד car)", async () => {
    deps.state = createAgentState({ group: "ג" });
    const option = { kind: "car" as const, carId: car("MODEL 3").id };
    const out = await tools().checkEligibility({ option });
    expect(out).toEqual(checkEligibility(deps.state.profile, option, config));
    expect(out.eligible).toBe(false);
  });
});

describe("value-of-use tools", () => {
  const atto = car("ATTO 3");

  it("full key → found, no confirmation needed", async () => {
    const out = await tools().getValueOfUse({
      makeCode: atto.makeCode,
      modelCode: atto.modelCode,
      regYear: atto.regYear,
      vehicleTypeCode: atto.vehicleTypeCode,
    });
    expect(out).toMatchObject({ status: "found", value: atto.valueOfUse, matchedBy: "key", mustConfirm: false });
  });

  it("ATTO 3 / TANG without the vehicle type code → ambiguous, no value", async () => {
    const out = await tools().getValueOfUse({ makeCode: atto.makeCode, modelCode: atto.modelCode, regYear: atto.regYear });
    expect(out.status).toBe("ambiguous");
    expect(out).not.toHaveProperty("value");
  });

  it("a unique partial match must be confirmed", async () => {
    const picanto = car("PICANTO");
    const out = await tools().getValueOfUse({ makeCode: picanto.makeCode, modelCode: picanto.modelCode, regYear: picanto.regYear });
    expect(out).toMatchObject({ status: "found", value: picanto.valueOfUse, matchedBy: "partial", mustConfirm: true });
  });

  it("search returns candidates only", async () => {
    const out = await tools().searchValueOfUse({ query: "atto 3", regYear: 2025 });
    expect(out.status).toBe("candidates");
    expect(out).not.toHaveProperty("value");
  });

  it("rejects codes without leading zeros", async () => {
    await expect(tools().getValueOfUse({ makeCode: "1014", modelCode: "3" })).rejects.toThrow();
  });
});

describe("askRepresentative tool", () => {
  it("queues the question and returns an open id", async () => {
    const out = await tools().askRepresentative({ question: "מה ההשתתפות העצמית ל-ATTO 3?", field: "participation", carId: car("ATTO 3").id });
    expect(out).toEqual({ questionId: expect.any(String), status: "open" });
    expect(deps.repQueue.questions).toHaveLength(1);
    expect(deps.repQueue.questions[0]).toMatchObject({ field: "participation", questionId: out.questionId });
  });
});

describe("missingProfileFields (engine)", () => {
  it("an empty profile is missing every F2 field", () => {
    expect(missingProfileFields({}, config)).toEqual([
      "group",
      "baseSalary",
      "commissions",
      "bonus",
      "pensionPct",
      "studyFundPct",
      "creditPoints",
      "childrenUnder23",
      "current",
    ]);
  });

  it("an occupation implies the group (data, not a guess)", () => {
    expect(missingProfileFields({ occupation: "מפתח/ת תוכנה" }, config)).not.toContain("group");
  });

  it("each reference profile is complete", () => {
    for (const e of employees) expect(missingProfileFields(e.profile, config)).toEqual([]);
  });
});
