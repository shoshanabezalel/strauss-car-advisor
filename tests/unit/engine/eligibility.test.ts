import { describe, expect, it } from "vitest";
import { loadConfig, type Situation } from "@/lib/config";
import { allowedCars, checkEligibility, evaluateSituation, type EmployeeProfile } from "@/lib/engine";

const config = loadConfig();
const { cars } = config.catalog;
const groupOrder = config.rules.groupOrder;
const familyIds = config.rules.familyTrack.cars;
const waiver: Situation = { kind: "waiver" };
const car = (carId: string): Situation => ({ kind: "car", carId });

/** A complete profile; tests override what they need. */
function profile(over: Partial<EmployeeProfile> = {}): EmployeeProfile {
  return {
    occupation: "מהנדס/ת תהליך",
    group: "ב",
    baseSalary: 15000,
    commissions: 0,
    bonus: 0,
    pensionPct: 0.06,
    studyFundPct: 0.025,
    creditPoints: 2.25,
    childrenUnder23: 1,
    current: { kind: "car", carId: "CAR-05", participation: 250 },
    ...over,
  };
}

describe("A8 — waiver allowed by occupation", () => {
  it("group ב process engineer may waive and gets maintenance 1,500", () => {
    const p = profile();
    const el = checkEligibility(p, waiver, config);
    expect(el).toMatchObject({ eligible: true, track: "waiver", reason: "העיסוק מאפשר ויתור", missing: [] });
    const r = evaluateSituation(p, waiver, config);
    expect(r.maintenance).toBe(1500);
    expect(r.valueOfUse).toBe(0);
    expect(r.participation).toBe(0);
    expect(r.breakdown).toBeDefined();
  });
});

describe("A9 — mandatory-car occupation cannot waive", () => {
  it("field sales rep → not eligible, mandatory car, no net", () => {
    const p = profile({ occupation: "נציג/ת מכירות שטח", group: "ב" });
    const el = checkEligibility(p, waiver, config);
    expect(el.eligible).toBe(false);
    expect(el.track).toBe("waiver");
    expect(el.reason).toMatch(/רכב חובה/);
    expect(el.missing).toEqual([]);
    expect(evaluateSituation(p, waiver, config).breakdown).toBeUndefined();
  });
});

describe("A10 — car above own group", () => {
  const p = profile({ occupation: "מנהל/ת מוצר", group: "ג", childrenUnder23: 2 });

  it("group ג employee requesting a group ד car → not eligible", () => {
    const groupD = cars.find((c) => c.group === "ד")!;
    const el = checkEligibility(p, car(groupD.id), config);
    expect(el).toMatchObject({ eligible: false, track: "regular", missing: [] });
    expect(el.reason).not.toBe("");
    expect(evaluateSituation(p, car(groupD.id), config).breakdown).toBeUndefined();
  });

  it("own group and lower are eligible", () => {
    for (const g of ["א", "ב", "ג"]) {
      const c = cars.find((x) => x.group === g)!;
      expect(checkEligibility(p, car(c.id), config).eligible, c.id).toBe(true);
    }
  });

  it("allowedCars offers exactly groups א–ג, no family cars", () => {
    const res = allowedCars(p, config);
    const lower = groupOrder.slice(0, groupOrder.indexOf("ג") + 1);
    expect(res.missing).toEqual([]);
    expect(res.cars.map((c) => c.id).sort()).toEqual(cars.filter((c) => lower.includes(c.group)).map((c) => c.id).sort());
    expect(res.cars.some((c) => familyIds.includes(c.id))).toBe(false);
  });
});

describe("A11 — family track needs 4+ children under 23", () => {
  it("3 children requesting Carnival → not eligible", () => {
    const el = checkEligibility(profile({ childrenUnder23: 3 }), car("CAR-19"), config);
    expect(el).toMatchObject({ eligible: false, track: "family", missing: [] });
    expect(el.reason).not.toBe("");
  });

  it("4 children → eligible, reason built from rules", () => {
    const el = checkEligibility(profile({ childrenUnder23: 4 }), car("CAR-19"), config);
    expect(el).toMatchObject({
      eligible: true,
      track: "family",
      reason: "מסלול ברוכת ילדים (4 ילדים); על הפער מעל התקציב - 50% עובד",
    });
  });

  it("allowedCars adds the family cars only when eligible", () => {
    expect(allowedCars(profile({ childrenUnder23: 3 }), config).cars.some((c) => familyIds.includes(c.id))).toBe(false);
    const ids = allowedCars(profile({ childrenUnder23: 5 }), config).cars.map((c) => c.id);
    for (const id of familyIds) expect(ids).toContain(id);
  });
});

describe("missing data → missing[], never a guess", () => {
  it("no group and no occupation → missing group", () => {
    const p = profile({ group: undefined, occupation: undefined });
    expect(checkEligibility(p, car("CAR-01"), config)).toMatchObject({ eligible: false, missing: ["group"] });
  });

  it("group absent but occupation known → group taken from the occupations table", () => {
    const p = profile({ group: undefined, occupation: "מנהל/ת מוצר" }); // group ג in occupations.json
    expect(checkEligibility(p, car("CAR-09"), config)).toMatchObject({ eligible: true, missing: [] });
    expect(checkEligibility(p, car("CAR-14"), config).eligible).toBe(false);
  });

  it("waiver without occupation → missing occupation", () => {
    const p = profile({ occupation: undefined });
    expect(checkEligibility(p, waiver, config)).toMatchObject({ eligible: false, missing: ["occupation"] });
  });

  it("unknown occupation name → missing occupation", () => {
    const p = profile({ occupation: "אסטרונאוט", group: undefined });
    expect(checkEligibility(p, waiver, config).missing).toEqual(["occupation"]);
  });

  it("family car with unknown children → missing childrenUnder23", () => {
    const p = profile({ childrenUnder23: undefined });
    expect(checkEligibility(p, car("CAR-19"), config)).toMatchObject({ eligible: false, missing: ["childrenUnder23"] });
  });

  it("car not in catalog → missing carId", () => {
    expect(checkEligibility(profile(), car("CAR-99"), config).missing).toEqual(["carId"]);
  });

  it("missing salary data → missing listed, no breakdown", () => {
    const r = evaluateSituation(profile({ baseSalary: undefined, creditPoints: undefined }), car("CAR-05"), config);
    expect(r.missing).toEqual(expect.arrayContaining(["baseSalary", "creditPoints"]));
    expect(r.breakdown).toBeUndefined();
  });

  it("allowedCars with unknown children → no family cars, missing childrenUnder23", () => {
    const res = allowedCars(profile({ childrenUnder23: undefined }), config);
    expect(res.missing).toEqual(["childrenUnder23"]);
    expect(res.cars.length).toBeGreaterThan(0);
    expect(res.cars.some((c) => familyIds.includes(c.id))).toBe(false);
  });

  it("allowedCars with unknown group → no cars, missing group", () => {
    const res = allowedCars(profile({ group: undefined, occupation: undefined }), config);
    expect(res).toEqual({ cars: [], missing: ["group"] });
  });
});
