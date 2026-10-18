import { describe, expect, it } from "vitest";
import { getCatalog, getRules } from "@/lib/config";
import { createMemoryVouSource, getValueOfUse, searchValueOfUse } from "@/lib/vou";
import { loadVouRecords } from "./fixture";

const rules = getRules();
const cars = getCatalog().cars;
const source = createMemoryVouSource(loadVouRecords());

const keyOf = (car: (typeof cars)[number]) => ({
  regYear: car.regYear,
  vehicleTypeCode: car.vehicleTypeCode,
  makeCode: car.makeCode,
  modelCode: car.modelCode,
});

describe("every catalog car matches the tax-authority table", () => {
  it.each(cars.map((c) => [c.id, c.model, c] as const))("%s %s", async (_id, _model, car) => {
    const res = await getValueOfUse(keyOf(car), source, rules);
    expect(res.status).toBe("found");
    if (res.status !== "found") return;
    expect(res.matchedBy).toBe("key");
    expect(res.value).toBe(car.valueOfUse);
    expect(res.record.taxYear).toBe(rules.valueOfUse.taxYear);
    expect(res.record.drive).toBe(car.drive);
    expect(res.record.listPrice).toBe(car.listPrice);
  });
});

describe("ATTO 3 / TANG collision (same make, model code and year; different vehicle type)", () => {
  const atto = cars.find((c) => c.model === "ATTO 3")!;

  it("vehicle type 1 → ATTO 3, at the catalog value", async () => {
    const res = await getValueOfUse(keyOf(atto), source, rules);
    expect(res.status === "found" && res.record.tradeName).toBe("ATTO 3");
    expect(res.status === "found" && res.value).toBe(atto.valueOfUse);
  });

  it("vehicle type 2 → TANG", async () => {
    const res = await getValueOfUse({ ...keyOf(atto), vehicleTypeCode: "2" }, source, rules);
    expect(res.status === "found" && res.record.tradeName).toBe("TANG");
  });

  it("without the vehicle type code → ambiguous with both, no value", async () => {
    const partial = { ...keyOf(atto), vehicleTypeCode: undefined };
    const res = await getValueOfUse(partial, source, rules);
    expect(res.status).toBe("ambiguous");
    expect(res).not.toHaveProperty("value");
    if (res.status !== "ambiguous") return;
    expect(res.candidates.map((c) => [c.vehicleTypeCode, c.tradeName])).toEqual([
      ["1", "ATTO 3"],
      ["2", "TANG"],
    ]);
  });
});

describe("partial and unknown keys", () => {
  it("a unique partial match is found, flagged as partial", async () => {
    const picanto = cars.find((c) => c.model === "PICANTO")!;
    const partial = { ...keyOf(picanto), vehicleTypeCode: undefined };
    const res = await getValueOfUse(partial, source, rules);
    expect(res).toMatchObject({ status: "found", matchedBy: "partial", value: picanto.valueOfUse });
  });

  it("an unknown key → not_found", async () => {
    const res = await getValueOfUse(
      { regYear: 2025, vehicleTypeCode: "1", makeCode: "99999", modelCode: "99999" },
      source,
      rules,
    );
    expect(res).toEqual({ status: "not_found" });
  });

  it("codes are matched as strings: no leading zeros means no match", async () => {
    const res = await getValueOfUse({ regYear: 2025, vehicleTypeCode: "1", makeCode: "885", modelCode: "643" }, source, rules);
    expect(res).toEqual({ status: "not_found" });
  });
});

describe("search by name", () => {
  it("trade name → candidates, never a picked value", async () => {
    const res = await searchValueOfUse({ query: "atto", regYear: 2025 }, source, rules);
    expect(res.status).toBe("candidates");
    expect(res).not.toHaveProperty("value");
    if (res.status !== "candidates") return;
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) expect(c.tradeName.toLowerCase()).toContain("atto");
  });

  it("make name (Hebrew) → candidates from that make", async () => {
    const res = await searchValueOfUse({ query: "בי ווי די", regYear: 2025 }, source, rules);
    expect(res.status).toBe("candidates");
    if (res.status !== "candidates") return;
    for (const c of res.candidates) expect(c.makeName).toContain("בי ווי די");
    expect(res.candidates.some((c) => c.tradeName === "ATTO 3")).toBe(true);
  });

  it("model name (description) → candidates", async () => {
    const res = await searchValueOfUse({ query: "B351A", regYear: 2025 }, source, rules);
    expect(res.status === "candidates" && res.candidates.every((c) => c.modelName.includes("B351A"))).toBe(true);
  });

  it("the limit caps candidates and flags truncation", async () => {
    const res = await searchValueOfUse({ query: "בי ווי די", limit: 5 }, source, rules);
    expect(res).toMatchObject({ status: "candidates", truncated: true });
    expect(res.status === "candidates" && res.candidates).toHaveLength(5);
  });

  it("a query that matches nothing → not_found", async () => {
    expect(await searchValueOfUse({ query: "NO SUCH CAR ZZZ" }, source, rules)).toEqual({ status: "not_found" });
  });

  it("special characters are matched literally", async () => {
    expect(await searchValueOfUse({ query: "ATTO 3 (EV)" }, source, rules)).toEqual({ status: "not_found" });
    expect(await searchValueOfUse({ query: "%" }, source, rules)).toEqual({ status: "not_found" });
  });

  it("an empty query is rejected", async () => {
    await expect(searchValueOfUse({ query: "   " }, source, rules)).rejects.toThrow(/query/);
  });
});
