import { beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  checkNumbers,
  createAgentState,
  createMemoryRepQueue,
  createToolHandlers,
  createTools,
  deriveNotices,
  type AgentDeps,
  type FindOptionsOutput,
} from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { findOptions } from "@/lib/engine";
import { latestComparison } from "@/lib/chat/handle-turn";
import { toComparisonView } from "@/lib/chat/comparison-view";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../vou/fixture";

const config = loadConfig();
const e1 = config.employees.employees.find((e) => e.id === "E-001")!;
const vouSource = createMemoryVouSource(loadVouRecords());
const names = config.catalog.cars.map((c) => `${c.make} ${c.model}`);

type Out = z.output<typeof FindOptionsOutput>;
type Ok = Extract<Out, { status: "ok" }>;

let deps: AgentDeps;
beforeEach(() => {
  deps = { config, vouSource, state: createAgentState(e1.profile), repQueue: createMemoryRepQueue() };
});
const find = async (input: unknown) => (await createToolHandlers(deps).findOptions(input as never)) as Out;
const ok = (o: Out) => {
  expect(o.status).toBe("ok");
  return o as Ok;
};

describe("findOptions tool (F8)", () => {
  it("electric, net may drop at most 100: matches are the engine's, in the comparison table order", async () => {
    const out = ok(await find({ drives: ["electric"], maxNetDrop: 100 }));
    const engine = findOptions(e1.profile, { drives: ["electric"], maxNetDrop: 100 }, config);
    expect(out.matches.map((m) => m.carId)).toEqual(engine.matches.map((m) => (m.option.situation as { carId: string }).carId));
    expect(out.matches.every((m) => m.fits && m.misses.length === 0)).toBe(true);
    expect(out.comparison!.options.map((o) => (o.situation as { carId: string }).carId)).toEqual(out.matches.map((m) => m.carId));
    for (const m of out.matches) expect(m.reason).toMatch(/^מתאים לכל התנאים/);
    // the existing comparison renders them
    const view = toComparisonView(out.comparison!, config);
    expect(view.rows.filter((r) => !r.isToday).map((r) => r.carId)).toEqual(out.matches.map((m) => m.carId));
  });

  it("no match → nearest with the exact shown shortfall", async () => {
    const out = ok(await find({ drives: ["electric"], minNetGain: 5000 }));
    expect(out.matches).toEqual([]);
    expect(out.nearest).toHaveLength(config.rules.search.nearestCount);
    out.nearest.forEach((n, i) => {
      const d = out.comparison!.options[i].display;
      expect(n.fits).toBe(false);
      expect(n.misses).toHaveLength(1);
      expect(n.misses[0].kind).toBe("netGain");
      expect(n.misses[0].display).toBe(5000 - d.diffVsToday!); // shown limit minus shown change
      expect(n.reason).toContain(`${n.misses[0].display.toLocaleString("en-US")} ₪`);
    });
  });

  it("net-drop miss: shown drop minus the limit", async () => {
    const out = ok(await find({ drives: ["petrol"], maxNetDrop: 0, maxParticipation: 0 }));
    out.nearest.forEach((n, i) => {
      const d = out.comparison!.options[i].display;
      const drop = n.misses.find((m) => m.kind === "netDrop");
      if (drop) expect(drop.display).toBe(-d.diffVsToday!);
      const p = n.misses.find((m) => m.kind === "participation")!;
      expect(p.display).toBe(d.participation);
    });
  });

  it("reasons contain only numbers from the engine's display values and the employee's limits", async () => {
    for (const input of [
      { drives: ["electric"], maxNetDrop: 100 },
      { drives: ["electric"], minNetGain: 5000 },
      { maxNetDrop: 0, maxParticipation: 100 },
      { drives: ["electric", "plugin"] },
    ]) {
      const out = ok(await find(input));
      const sources = [out.constraints, out.comparison?.options.map((o) => o.display), [...out.matches, ...out.nearest].map((m) => m.misses.map((x) => x.display))];
      for (const r of [...out.matches, ...out.nearest]) {
        expect(checkNumbers(r.reason, { toolOutputs: sources, ignoreNames: names })).toEqual({ ok: true, invented: [] });
      }
      // not-eligible reasons quote the engine's eligibility reason verbatim
      for (const r of out.notEligible) expect(r.reason).toMatch(/^אין זכאות: /);
    }
  });

  it("lists cars above the employee's group as not eligible, never as matches", async () => {
    const out = ok(await find({ drives: ["electric"] }));
    const higher = config.catalog.cars.filter((c) => c.drive === "electric" && c.group === "ד").map((c) => c.id);
    expect(out.notEligible.map((n) => n.carId).sort()).toEqual(higher.sort());
    for (const m of out.matches) expect(higher).not.toContain(m.carId);
  });

  it("rejects unknown fuel types and empty constraints", async () => {
    await expect(find({ drives: ["diesel"] })).rejects.toThrow();
    await expect(find({})).rejects.toThrow();
    await expect(find({ maxNetDrop: -5 })).rejects.toThrow();
    const schema = (createTools(deps).findOptions as { inputSchema: { safeParse?: (x: unknown) => { success: boolean } } }).inputSchema;
    expect(schema.safeParse!({ drives: ["diesel"] }).success).toBe(false);
  });

  it("incomplete profile → missing fields, no numbers, and the missing notice asks for them", async () => {
    deps.state = createAgentState({ group: "ג" });
    const out = await find({ drives: ["electric"], maxNetDrop: 100 });
    expect(out.status).toBe("missing");
    expect(Object.keys(out).sort()).toEqual(["missing", "status"]); // field names only, no amounts
    const notices = deriveNotices([{ toolName: "findOptions", output: out }]);
    expect(notices[0]).toMatchObject({ kind: "missing" });
    expect((notices[0] as { fields: string[] }).fields).toContain("baseSalary");
  });

  it("keeps needsConfirmation for catalog defaults and uses the representative's confirmed participation", async () => {
    const out = ok(await find({ drives: ["electric"] }));
    expect(out.comparison!.options.every((o) => o.needsConfirmation)).toBe(true);
    const id = out.matches[0].carId;
    deps.state.repParticipation = { [id]: 0 };
    const again = ok(await find({ drives: ["electric"] }));
    const row = again.comparison!.options.find((o) => (o.situation as { carId: string }).carId === id)!;
    expect(row).toMatchObject({ participation: 0, participationSource: "rep", needsConfirmation: false });
  });

  it("the turn's comparison is the latest compareOptions or findOptions table", async () => {
    const out = ok(await find({ drives: ["electric"], maxNetDrop: 100 }));
    const compared = await createToolHandlers(deps).compareOptions({ options: [{ kind: "waiver" }] });
    expect(latestComparison([{ toolName: "compareOptions", output: compared }, { toolName: "findOptions", output: out }])).toBe(out.comparison);
    expect(latestComparison([{ toolName: "findOptions", output: out }, { toolName: "compareOptions", output: compared }])).toBe(compared);
    expect(latestComparison([{ toolName: "findOptions", output: { status: "missing", missing: ["group"] } }])).toBeUndefined();
  });
});
