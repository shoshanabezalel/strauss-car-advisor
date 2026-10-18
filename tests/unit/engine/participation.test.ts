import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { evaluateSituation } from "@/lib/engine";
import { roundShekel } from "@/lib/format/money";

// Decision (18/10): participation for a new car = catalog default, flagged needsConfirmation; a rep value overrides.
const config = loadConfig();
const e1 = config.employees.employees.find((x) => x.id === "E-001")!; // ATTO 3 (CAR-10), default 300
const atto = config.catalog.cars.find((c) => c.id === "CAR-10")!;

describe("participation source", () => {
  it("omitted → catalog default, needsConfirmation, same net as the reference", () => {
    const r = evaluateSituation(e1.profile, { kind: "car", carId: "CAR-10" }, config);
    expect(r.participation).toBe(atto.defaultParticipation);
    expect(r.participationSource).toBe("catalog_default");
    expect(r.needsConfirmation).toBe(true);
    expect(roundShekel(r.breakdown!.net)).toBe(e1.expected.netAlt);
  });

  it("explicit catalog_default source keeps the flag", () => {
    const r = evaluateSituation(e1.profile, { kind: "car", carId: "CAR-10", participation: 300, participationSource: "catalog_default" }, config);
    expect(r.needsConfirmation).toBe(true);
  });

  it("rep override wins and clears the flag", () => {
    const def = evaluateSituation(e1.profile, { kind: "car", carId: "CAR-10" }, config);
    const rep = evaluateSituation(e1.profile, { kind: "car", carId: "CAR-10", participation: 350, participationSource: "rep" }, config);
    expect(rep.participation).toBe(350);
    expect(rep.participationSource).toBe("rep");
    expect(rep.needsConfirmation).toBe(false);
    expect(rep.breakdown!.net).toBeCloseTo(def.breakdown!.net - 50, 9);
  });

  it("employee-stated participation for the current car needs no confirmation", () => {
    const r = evaluateSituation(e1.profile, e1.profile.current!, config);
    expect(r.participation).toBe(300);
    expect(r.needsConfirmation).toBe(false);
  });

  it("waiver has no participation", () => {
    const e5 = config.employees.employees.find((x) => x.id === "E-005")!;
    const r = evaluateSituation(e5.profile, { kind: "waiver" }, config);
    expect(r.participation).toBe(0);
    expect(r.needsConfirmation).toBe(false);
  });
});
