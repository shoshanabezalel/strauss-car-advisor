import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseChallengeScript, parseRules, validateConfig } from "@/lib/config";
import { maxParticipation } from "@/lib/engine";

const config = loadConfig();

describe("challenge script (A7, data/challenge-script.json)", () => {
  it("loads, validates and points at catalog cars", () => {
    const c = config.challenge;
    const ids = new Set(config.catalog.cars.map((x) => x.id));
    expect(c.alternative.kind).toBe("car");
    if (c.alternative.kind === "car") expect(ids.has(c.alternative.carId)).toBe(true);
    if (c.profile.current.kind === "car") expect(ids.has(c.profile.current.carId)).toBe(true);
    // the rep answers about the requested car
    expect(c.repAnswer.field).toBe("participation");
    if (c.alternative.kind === "car") expect(c.repAnswer.carId).toBe(c.alternative.carId);
    expect(c.profile.group).toBeDefined();
  });

  it("an unknown car is a config error", () => {
    const bad = { ...config, challenge: { ...config.challenge, alternative: { kind: "car" as const, carId: "CAR-99" } } };
    expect(() => validateConfig(bad)).toThrow(ConfigError);
  });

  it("a malformed file is rejected", () => {
    expect(() => parseChallengeScript({ profile: {} })).toThrow(ConfigError);
  });
});

describe("participation upper bound", () => {
  it("rules carry a positive participation.max", () => {
    expect(config.rules.participation.max).toBeGreaterThan(0);
    const withoutBound: Record<string, unknown> = structuredClone(config.rules);
    delete withoutBound.participation;
    expect(() => parseRules(withoutBound)).toThrow(ConfigError);
  });

  it("is the lower of rules max and the car's monthly cost", () => {
    const car = config.catalog.cars[0];
    expect(maxParticipation(car, { ...config.rules, participation: { ...config.rules.participation, max: car.monthlyCost - 1 } })).toBe(
      car.monthlyCost - 1,
    );
    expect(maxParticipation(car, { ...config.rules, participation: { ...config.rules.participation, max: car.monthlyCost + 1 } })).toBe(
      car.monthlyCost,
    );
  });

  it("every catalog default is within the bound (data sanity)", () => {
    for (const car of config.catalog.cars) expect(car.defaultParticipation).toBeLessThanOrEqual(maxParticipation(car, config.rules));
  });
});
