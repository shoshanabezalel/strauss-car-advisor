import { describe, expect, it } from "vitest";
import {
  ambiguousVouMessage,
  createAgentState,
  createMemoryRepQueue,
  missingDataMessage,
  openingMessage,
  runAgentTurn,
  UNKNOWN_PARTICIPATION_MESSAGE,
  type AgentDeps,
} from "@/lib/agent";
import { createMockModel, demoPrompts } from "@/lib/agent/mock-model";
import { loadConfig } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../vou/fixture";

// The mock model scripts the tool calls; the real tools, engine and number-guard do the rest.
const config = loadConfig();
const vouSource = createMemoryVouSource(loadVouRecords());
const deps = (): AgentDeps => ({ config, vouSource, state: createAgentState(), repQueue: createMemoryRepQueue() });
const turn = (text: string, d = deps()) =>
  runAgentTurn({ model: createMockModel(config), messages: [{ role: "user", content: text }], deps: d });

type Compare = { today: { display: { net?: number } }; options: { display: { net?: number; diffVsToday?: number } }[] };
const compareOf = (t: Awaited<ReturnType<typeof turn>>) =>
  t.toolOutputs.find((o) => o.toolName === "compareOptions")?.output as Compare | undefined;

describe("mock model: sample employees", () => {
  it.each(config.employees.employees.map((e) => [e.id, e] as const))(
    "%s: one updateProfile + compareOptions, sheet values, guard passes",
    async (_id, e) => {
      const t = await turn(openingMessage(config, e));
      expect(t.blocked).toBe(false);
      expect(t.guard).toEqual({ ok: true, invented: [] });
      expect(t.toolCalls.map((c) => c.toolName)).toEqual(["updateProfile", "compareOptions"]);

      const c = compareOf(t)!;
      expect(c.today.display.net).toBe(e.expected.netToday);
      expect(c.options[0].display.net).toBe(e.expected.netAlt);
      expect(c.options[0].display.diffVsToday).toBe(e.expected.diff);
      // the reply quotes the engine's display values
      expect(t.text).toContain(e.expected.netAlt.toLocaleString("en-US"));
      expect(t.text).toContain(Math.abs(e.expected.diff).toLocaleString("en-US"));
      expect(t.text).toMatch(e.expected.diff >= 0 ? /עלייה/ : /ירידה/);
    },
  );

  it("a new car's participation is left to the catalog default → participation notice", async () => {
    const e = config.employees.employees[0];
    const t = await turn(openingMessage(config, e));
    const carId = e.alternative.kind === "car" ? e.alternative.carId : "";
    expect(t.notices).toContainEqual({ kind: "participation_unconfirmed", carId });
  });
});

describe("mock model: other scenarios", () => {
  it("missing data: saves the group and asks for the rest", async () => {
    const d = deps();
    const t = await turn(missingDataMessage(config), d);
    expect(t.blocked).toBe(false);
    expect(d.state.profile.group).toBeDefined();
    expect(t.notices).toContainEqual({ kind: "missing", fields: expect.arrayContaining(["baseSalary"]) });
  });

  it("unknown participation goes to the representative", async () => {
    const d = deps();
    const t = await turn(UNKNOWN_PARTICIPATION_MESSAGE, d);
    expect(t.toolCalls.map((c) => c.toolName)).toEqual(["askRepresentative"]);
    expect(t.notices).toContainEqual({ kind: "rep_question_open", questionId: "q1" });
    expect(t.blocked).toBe(false);
  });

  it("ATTO 3 without the vehicle type code is ambiguous", async () => {
    const t = await turn(ambiguousVouMessage(config));
    expect(t.toolCalls.map((c) => c.toolName)).toEqual(["getValueOfUse"]);
    expect(t.notices.some((n) => n.kind === "ambiguous_vou")).toBe(true);
    expect(t.blocked).toBe(false);
  });

  it("an unknown message gets a fixed reply with no digits and no tool calls", async () => {
    const t = await turn("מה שלומך?");
    expect(t.toolCalls).toEqual([]);
    expect(t.text).not.toMatch(/\d/);
    expect(t.blocked).toBe(false);
  });

  it("a follow-up turn in the same conversation still finds its scenario", async () => {
    const e = config.employees.employees[0];
    const d = deps();
    const first = await turn("היי", d);
    const t = await runAgentTurn({
      model: createMockModel(config),
      messages: [{ role: "user", content: "היי" }, ...first.responseMessages, { role: "user", content: openingMessage(config, e) }],
      deps: d,
    });
    expect(compareOf(t)?.options[0].display.net).toBe(e.expected.netAlt);
  });
});

describe("demoPrompts", () => {
  it("offers every sample employee plus the missing / representative / ambiguous scenarios", () => {
    const prompts = demoPrompts(config);
    for (const e of config.employees.employees) expect(prompts.map((p) => p.text)).toContain(openingMessage(config, e));
    expect(prompts.map((p) => p.text)).toEqual(
      expect.arrayContaining([missingDataMessage(config), UNKNOWN_PARTICIPATION_MESSAGE, ambiguousVouMessage(config)]),
    );
    expect(new Set(prompts.map((p) => p.id)).size).toBe(prompts.length);
  });
});

describe("mock model: F8 constraint search", () => {
  const e1 = config.employees.employees.find((e) => e.id === "E-001")!;
  const ev = demoPrompts(config).find((p) => p.id === "find-ev")!;

  it("electric, net drop ≤ 100 → findOptions with those parameters, reply passes the guard", async () => {
    const t = await turn(ev.text, { ...deps(), state: createAgentState(e1.profile) });
    expect(t.toolCalls).toEqual([expect.objectContaining({ toolName: "findOptions", input: { drives: ["electric"], maxNetDrop: 100 } })]);
    expect(t.guard).toEqual({ ok: true, invented: [] });
    expect(t.blocked).toBe(false);
    const out = t.toolOutputs[0].output as { status: string; matches: { reason: string }[] };
    expect(out.status).toBe("ok");
    for (const m of out.matches) expect(t.text).toContain(m.reason);
  });

  it("incomplete profile → asks instead of listing cars", async () => {
    const t = await turn(ev.text);
    expect(t.guard.ok).toBe(true);
    expect(t.text).toContain("חסרים");
    expect(t.notices[0]).toMatchObject({ kind: "missing" });
  });
});
