import { beforeAll, describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers, deriveNotices, type ToolHandlers } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../vou/fixture";

const config = loadConfig();
const e1 = config.employees.employees[0];
const car = (model: string) => config.catalog.cars.find((c) => c.model === model)!;
let tools: ToolHandlers;
beforeAll(() => {
  tools = createToolHandlers({
    config,
    vouSource: createMemoryVouSource(loadVouRecords()),
    state: createAgentState(e1.profile),
    repQueue: createMemoryRepQueue(),
  });
});

describe("deriveNotices", () => {
  it("unconfirmed catalog-default participation", async () => {
    const atto = car("ATTO 3");
    const output = await tools.compareOptions({ options: [{ kind: "car", carId: atto.id }] });
    expect(deriveNotices([{ toolName: "compareOptions", output }])).toEqual([
      { kind: "participation_unconfirmed", carId: atto.id },
    ]);
  });

  it("no notice when participation is stated", async () => {
    // M5: the model may not set participationSource; a stated participation is the employee's
    const output = await tools.compareOptions({ options: [{ kind: "car", carId: car("ATTO 3").id, participation: 300 }] });
    expect(deriveNotices([{ toolName: "compareOptions", output }])).toEqual([]);
  });

  it("missing fields from the latest compareOptions or updateProfile", () => {
    const update = { ok: true, profile: {}, sources: {}, missing: ["baseSalary", "current"] };
    expect(deriveNotices([{ toolName: "updateProfile", output: update }])).toEqual([
      { kind: "missing", fields: ["baseSalary", "current"] },
    ]);
    const later = { ...update, missing: [] };
    expect(deriveNotices([{ toolName: "updateProfile", output: update }, { toolName: "updateProfile", output: later }])).toEqual([]);
  });

  it("missing fields reported by compareOptions (today + options, deduplicated)", async () => {
    const t = createToolHandlers({
      config,
      vouSource: createMemoryVouSource([]),
      state: createAgentState({ group: "ג" }),
      repQueue: createMemoryRepQueue(),
    });
    const output = await t.compareOptions({ options: [{ kind: "waiver" }] });
    const [notice] = deriveNotices([{ toolName: "compareOptions", output }]);
    expect(notice.kind).toBe("missing");
    const fields = notice.kind === "missing" ? notice.fields : [];
    expect(fields).toContain("current");
    expect(fields).toContain("occupation");
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("ambiguous and partial value-of-use", async () => {
    const atto = car("ATTO 3");
    const picanto = car("PICANTO");
    const ambiguous = await tools.getValueOfUse({ makeCode: atto.makeCode, modelCode: atto.modelCode, regYear: atto.regYear });
    const partial = await tools.getValueOfUse({ makeCode: picanto.makeCode, modelCode: picanto.modelCode, regYear: picanto.regYear });
    const notices = deriveNotices([
      { toolName: "getValueOfUse", output: ambiguous },
      { toolName: "getValueOfUse", output: partial },
    ]);
    expect(notices.map((n) => n.kind)).toEqual(["ambiguous_vou", "confirm_vou_match"]);
  });

  it("open representative question", () => {
    const notices = deriveNotices([{ toolName: "askRepresentative", output: { questionId: "q1", status: "open" } }]);
    expect(notices).toEqual([{ kind: "rep_question_open", questionId: "q1" }]);
  });
});
