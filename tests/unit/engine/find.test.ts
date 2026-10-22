import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { checkEligibility, compareOptions, findOptions, type EmployeeProfile, type OptionResult } from "@/lib/engine";

const config = loadConfig();
const { cars } = config.catalog;
const { maxMatches, nearestCount } = config.rules.search;
const e1 = config.employees.employees.find((e) => e.id === "E-001")!; // group ג, today CAR-09 (hybrid)
const profile: EmployeeProfile = e1.profile;
const drive = (id: string) => cars.find((c) => c.id === id)!.drive;
const idOf = (o: OptionResult) => (o.situation.kind === "car" ? o.situation.carId : "waiver");

/** The engine's own diff for one car, to check findOptions against compareOptions (no numbers hard-coded). */
const diffOf = (carId: string) => compareOptions(profile, [{ kind: "car", carId }], config).options[0].diffVsToday!;

describe("findOptions (F8)", () => {
  it("filters by drive type and net limit, best net first, at most maxMatches", () => {
    const r = findOptions(profile, { drives: ["electric"], maxNetDrop: 100 }, config);
    expect(r.missing).toEqual([]);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.length).toBeLessThanOrEqual(maxMatches);
    for (const m of r.matches) {
      expect(drive(idOf(m.option))).toBe("electric");
      expect(m.option.diffVsToday).toBeGreaterThanOrEqual(-100);
      expect(m.option.diffVsToday).toBe(diffOf(idOf(m.option)));
      expect(m.misses).toEqual([]);
    }
    const diffs = r.matches.map((m) => m.option.diffVsToday!);
    expect(diffs).toEqual([...diffs].sort((a, b) => b - a));
    expect(r.nearest).toEqual([]);
  });

  it("returns every eligible car of the drive that fits, and none that doesn't", () => {
    const r = findOptions(profile, { drives: ["electric"], maxNetDrop: 100 }, config);
    const expected = cars
      .filter((c) => c.drive === "electric" && c.id !== "CAR-09")
      .filter((c) => checkEligibility(profile, { kind: "car", carId: c.id }, config).eligible)
      .filter((c) => diffOf(c.id) >= -100)
      .map((c) => c.id);
    expect(r.matches.map((m) => idOf(m.option)).sort()).toEqual(expected.slice(0, maxMatches).sort());
  });

  it("respects eligibility: never offers a car above the employee's group, lists it as not eligible", () => {
    const r = findOptions(profile, { drives: ["electric"] }, config);
    const higher = cars.filter((c) => c.drive === "electric" && c.group === "ד").map((c) => c.id);
    expect(higher.length).toBeGreaterThan(0);
    for (const m of r.matches) expect(higher).not.toContain(idOf(m.option));
    expect(r.notEligible.map(idOf).sort()).toEqual(higher.sort());
    for (const o of r.notEligible) expect(o.breakdown).toBeUndefined();
  });

  it("family-track cars only with enough children", () => {
    const petrol = (p: EmployeeProfile) => findOptions(p, { drives: ["petrol"] }, config).matches.map((m) => idOf(m.option));
    const family = config.rules.familyTrack.cars;
    const few = petrol({ ...profile, childrenUnder23: 0 });
    for (const id of family) expect(few).not.toContain(id);
  });

  it("no match → the nearest options with the exact shortfall", () => {
    const r = findOptions(profile, { drives: ["electric"], minNetGain: 100000 }, config);
    expect(r.matches).toEqual([]);
    expect(r.nearest).toHaveLength(nearestCount);
    for (const n of r.nearest) {
      expect(n.misses).toEqual([{ kind: "netGain", by: 100000 - diffOf(idOf(n.option)) }]);
    }
    // the nearest are the eligible electric cars with the best net change
    const best = Math.max(...cars.filter((c) => c.drive === "electric" && ["א", "ב", "ג"].includes(c.group)).map((c) => diffOf(c.id)));
    expect(r.nearest[0].option.diffVsToday).toBe(best);
  });

  it("maxNetDrop shortfall is the exact amount below the limit", () => {
    const r = findOptions(profile, { drives: ["electric"], maxNetDrop: 0, minNetGain: 100000 }, config);
    for (const n of r.nearest) {
      const d = n.option.diffVsToday!;
      const drop = n.misses.find((m) => m.kind === "netDrop");
      if (d < 0) expect(drop).toEqual({ kind: "netDrop", by: -d });
      else expect(drop).toBeUndefined();
    }
  });

  it("max participation is a constraint too", () => {
    const r = findOptions(profile, { maxParticipation: 200 }, config);
    for (const m of r.matches) expect(m.option.participation).toBeLessThanOrEqual(200);
    const none = findOptions(profile, { maxParticipation: 0 }, config);
    expect(none.matches).toEqual([]);
    for (const n of none.nearest) expect(n.misses).toContainEqual({ kind: "participation", by: n.option.participation });
  });

  it("uses the catalog default participation and keeps needsConfirmation; a rep answer replaces it", () => {
    const r = findOptions(profile, { drives: ["electric"] }, config);
    for (const m of r.matches) expect(m.option.needsConfirmation).toBe(true);
    const id = idOf(r.matches[0].option);
    const confirmed = findOptions(profile, { drives: ["electric"] }, config, { [id]: 0 });
    const opt = [...confirmed.matches, ...confirmed.nearest].find((m) => idOf(m.option) === id)!.option;
    expect(opt).toMatchObject({ participation: 0, participationSource: "rep", needsConfirmation: false });
  });

  it("skips today's car", () => {
    const r = findOptions(profile, { drives: ["hybrid"] }, config);
    expect([...r.matches, ...r.nearest].map((m) => idOf(m.option))).not.toContain("CAR-09");
  });

  it("incomplete profile → only the missing fields, nothing computed", () => {
    const r = findOptions({ group: "ג" }, { drives: ["electric"], maxNetDrop: 100 }, config);
    expect(r.missing).toContain("baseSalary");
    expect(r.missing).toContain("current");
    expect(r).toMatchObject({ matches: [], nearest: [], notEligible: [] });
  });

  it("is deterministic", () => {
    const c = { drives: ["electric" as const, "hybrid" as const], maxNetDrop: 300 };
    expect(findOptions(profile, c, config)).toEqual(findOptions(profile, c, config));
  });
});
