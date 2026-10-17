import { describe, expect, it } from "vitest";
import rulesJson from "../../data/strauss-rules.json";
import catalogJson from "../../data/catalog.json";
import occupationsJson from "../../data/occupations.json";
import employeesJson from "../../data/sample-employees.json";
import {
  ConfigError,
  DRIVES,
  loadConfig,
  parseCatalog,
  parseOccupations,
  parseRules,
  parseSampleEmployees,
  validateConfig,
} from "@/lib/config";

const clone = <T>(x: T): T => structuredClone(x);

function freshConfig() {
  return {
    rules: parseRules(clone(rulesJson)),
    catalog: parseCatalog(clone(catalogJson)),
    occupations: parseOccupations(clone(occupationsJson)),
    employees: parseSampleEmployees(clone(employeesJson)),
  };
}

describe("data files parse with Zod", () => {
  it("rules", () => {
    const rules = parseRules(clone(rulesJson));
    expect(rules.groupOrder).toHaveLength(4);
  });

  it("catalog has 20 cars", () => {
    expect(parseCatalog(clone(catalogJson)).cars).toHaveLength(20);
  });

  it("occupations has 14 rows", () => {
    expect(parseOccupations(clone(occupationsJson)).occupations).toHaveLength(14);
  });

  it("sample employees has 6 rows", () => {
    expect(parseSampleEmployees(clone(employeesJson)).employees).toHaveLength(6);
  });

  it("loadConfig passes cross-file validation", () => {
    const cfg = loadConfig();
    expect(cfg.catalog.cars).toHaveLength(20);
    expect(cfg.occupations.occupations).toHaveLength(14);
    expect(cfg.employees.employees).toHaveLength(6);
  });
});

describe("invalid rules are rejected with a readable error", () => {
  const mutate = (fn: (r: any) => void) => {
    const r = clone(rulesJson) as any;
    fn(r);
    return () => parseRules(r);
  };

  it("missing budget for a group in groupOrder", () => {
    const run = mutate((r) => delete r.budgets[r.groupOrder[3]]);
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(/budgets/);
  });

  it("brackets not ascending", () => {
    const run = mutate((r) => {
      r.netMethod.brackets[1][0] = 5000;
    });
    expect(run).toThrow(/brackets/);
  });

  it("last bracket cap is not null", () => {
    const run = mutate((r) => {
      r.netMethod.brackets[r.netMethod.brackets.length - 1][0] = 99999;
    });
    expect(run).toThrow(/brackets/);
  });

  it("null cap before the last bracket", () => {
    const run = mutate((r) => {
      r.netMethod.brackets[2][0] = null;
    });
    expect(run).toThrow(/brackets/);
  });

  it("rate outside 0..1", () => {
    const run = mutate((r) => {
      r.netMethod.nationalInsurance.highRate = 7;
    });
    expect(run).toThrow(/highRate/);
  });

  it("driveField keys are not exactly 0..3", () => {
    const run = mutate((r) => {
      r.valueOfUse.driveField = { "1": "a", "2": "b", "3": "c", "4": "d" };
    });
    expect(run).toThrow(/driveField/);
  });

  it("value-of-use key does not have 5 parts", () => {
    const run = mutate((r) => r.valueOfUse.key.pop());
    expect(run).toThrow(/key/);
  });
});

describe("cross-file invariants", () => {
  it("budgets keys equal groupOrder", () => {
    const cfg = freshConfig();
    cfg.rules.groupOrder = [...cfg.rules.groupOrder, "ה"];
    expect(() => validateConfig(cfg)).toThrow(/budget/i);
  });

  it("catalog car in an unknown group (and not a family-track car) is rejected", () => {
    const cfg = freshConfig();
    cfg.catalog.cars[0].group = "ז";
    expect(() => validateConfig(cfg)).toThrow(/CAR-01/);
  });

  it("family-track cars exist in the catalog and are outside groupOrder", () => {
    const cfg = freshConfig();
    for (const id of cfg.rules.familyTrack.cars) {
      const car = cfg.catalog.cars.find((c) => c.id === id);
      expect(car, id).toBeDefined();
      expect(cfg.rules.groupOrder).not.toContain(car!.group);
    }
    cfg.rules.familyTrack.cars = ["CAR-99"];
    expect(() => validateConfig(cfg)).toThrow(/CAR-99/);
  });

  it("occupation with unknown group is rejected", () => {
    const cfg = freshConfig();
    cfg.occupations.occupations[0].group = "ז";
    expect(() => validateConfig(cfg)).toThrow(/occupation/i);
  });

  it("mandatory-car occupation cannot allow waiver", () => {
    const cfg = freshConfig();
    const o = cfg.occupations.occupations.find((x) => x.carMandatory)!;
    o.waiverAllowed = true;
    expect(() => validateConfig(cfg)).toThrow(/waiver/i);
  });

  it("every employee's occupation and cars exist, group matches occupation", () => {
    const { rules, catalog, occupations, employees } = freshConfig();
    const carIds = new Set(catalog.cars.map((c) => c.id));
    for (const e of employees.employees) {
      const occ = occupations.occupations.find((o) => o.name === e.profile.occupation);
      expect(occ, e.id).toBeDefined();
      expect(e.profile.group).toBe(occ!.group);
      expect(rules.groupOrder).toContain(e.profile.group);
      for (const s of [e.profile.current, e.alternative]) {
        if (s.kind === "car") expect(carIds.has(s.carId), `${e.id} ${s.carId}`).toBe(true);
      }
    }
  });

  it("employee pointing to unknown car is rejected", () => {
    const cfg = freshConfig();
    cfg.employees.employees[0].alternative = { kind: "car", carId: "CAR-99", participation: 0 };
    expect(() => validateConfig(cfg)).toThrow(/CAR-99/);
  });

  it("employee with unknown occupation is rejected", () => {
    const cfg = freshConfig();
    cfg.employees.employees[0].profile.occupation = "אסטרונאוט";
    expect(() => validateConfig(cfg)).toThrow(/E-001/);
  });
});

describe("catalog data fidelity", () => {
  const { cars } = parseCatalog(clone(catalogJson));

  it("codes are 5-digit strings with leading zeros; vehicle type code is '1'", () => {
    for (const c of cars) {
      expect(c.makeCode, c.id).toMatch(/^\d{5}$/);
      expect(c.modelCode, c.id).toMatch(/^\d{5}$/);
      expect(c.vehicleTypeCode, c.id).toBe("1");
    }
    expect(cars.find((c) => c.id === "CAR-10")!.makeCode).toBe("01014");
    expect(cars.find((c) => c.id === "CAR-10")!.modelCode).toBe("00003");
  });

  it("drive is one of the 4 enum values; known cars map correctly", () => {
    for (const c of cars) expect(DRIVES).toContain(c.drive);
    const byId = Object.fromEntries(cars.map((c) => [c.id, c.drive]));
    expect(byId["CAR-01"]).toBe("petrol");
    expect(byId["CAR-02"]).toBe("hybrid");
    expect(byId["CAR-03"]).toBe("electric");
    expect(byId["CAR-16"]).toBe("plugin");
  });

  it("invalid catalog row is rejected", () => {
    const bad = clone(catalogJson) as any;
    bad.cars[0].makeCode = 885;
    expect(() => parseCatalog(bad)).toThrow(ConfigError);
  });
});

describe("sample employees match the reference table (TECH-DESIGN §3)", () => {
  // net today → alternative, EV gross; from the "חישובים" sheet. Never edit to make a test pass.
  const reference: Record<string, [number, number, number]> = {
    "E-001": [11032, 11693, 440],
    "E-002": [8600, 5078, 0],
    "E-003": [15047, 13109, 473],
    "E-004": [10693, 11900, 440],
    "E-005": [14244, 17806, 0],
    "E-006": [17073, 17794, 473],
  };
  const { employees } = parseSampleEmployees(clone(employeesJson));

  it.each(Object.entries(reference))("%s", (id, [today, alt, ev]) => {
    const e = employees.find((x) => x.id === id)!;
    expect(e.expected.netToday).toBe(today);
    expect(e.expected.netAlt).toBe(alt);
    expect(e.expected.electricGross).toBe(ev);
    expect(e.expected.diff).toBe(alt - today);
  });

  it("situations are mapped (car by id, waiver by kind)", () => {
    const byId = Object.fromEntries(employees.map((e) => [e.id, e]));
    expect(byId["E-001"].profile.current).toEqual({ kind: "car", carId: "CAR-09", participation: 300 });
    expect(byId["E-001"].alternative).toMatchObject({ kind: "car", carId: "CAR-10" });
    expect(byId["E-003"].profile.current).toEqual({ kind: "waiver" });
    expect(byId["E-005"].alternative).toEqual({ kind: "waiver" });
    expect(byId["E-002"].alternative).toMatchObject({ kind: "car", carId: "CAR-19" });
  });

  it("percentages are stored as fractions", () => {
    const e3 = employees.find((x) => x.id === "E-003")!;
    expect(e3.profile.pensionPct).toBe(0.065);
    expect(e3.profile.studyFundPct).toBe(0.025);
  });
});
