import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getRules } from "@/lib/config";
import { decodeCp1255, parseVouCsv, VouParseError } from "@/lib/vou";
import { loadVouRecords, VOU_CSV_PATH } from "./fixture";

const rules = getRules();

// The real PICANTO row (CAR-01) from the file, used to build small inputs.
const LINES = decodeCp1255(readFileSync(VOU_CSV_PATH)).split(/\r?\n/);
const HEADER = LINES[0];
const ROW = LINES.find((l) => l.startsWith("2026,2025,1,00885,") && l.includes(",00643,"))!;
const csv = (...rows: string[]) => [HEADER, ...rows].join("\r\n") + "\r\n";

describe("parseVouCsv on the real file", () => {
  const records = loadVouRecords();

  it("decodes cp1255: the Hebrew header is readable", () => {
    expect(HEADER.startsWith("שנת מס")).toBe(true);
  });

  it("reads every data row", () => {
    expect(records).toHaveLength(77988);
  });

  it("keeps codes as strings with leading zeros and trims every field", () => {
    // Plain checks + one assertion: ~390k expect() calls over 78k rows timed out under load.
    const code = /^\d{5}$/;
    const trimmed = (s: string) => s === s.trim();
    const bad = records.filter(
      (r) =>
        !code.test(r.makeCode) ||
        !code.test(r.modelCode) ||
        !trimmed(r.tradeName) ||
        !trimmed(r.makeName) ||
        !trimmed(r.modelName),
    );
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("has unique five-part keys", () => {
    const keys = new Set(
      records.map((r) => [r.taxYear, r.regYear, r.vehicleTypeCode, r.makeCode, r.modelCode].join("|")),
    );
    expect(keys.size).toBe(records.length);
  });
});

describe("parseVouCsv on a single row", () => {
  it("maps columns by position", () => {
    const [r] = parseVouCsv(csv(ROW), rules);
    expect(r).toMatchObject({
      taxYear: 2026,
      regYear: 2025,
      vehicleTypeCode: "1",
      makeCode: "00885",
      makeName: "קיה קוריאה",
      modelCode: "00643",
      modelName: "B351A",
      tradeName: "PICANTO",
      driveCode: "0",
      drive: "petrol",
      listPrice: 105900,
      valueOfUse: 2690,
    });
    expect(r.raw).toMatchObject({ effectiveDate: "01/01/2025", adjustedPrice: 108400, engineCc: "01197" });
  });

  it("maps drive codes per rules, not per the (wrong) CSV header", () => {
    const withDrive = (code: string) => {
      const cols = ROW.split(",");
      cols[10] = code;
      return parseVouCsv(csv(cols.join(",")), rules)[0].drive;
    };
    expect(["0", "1", "2", "3"].map(withDrive)).toEqual(["petrol", "hybrid", "plugin", "electric"]);
  });

  it("rejects an unknown drive code", () => {
    const cols = ROW.split(",");
    cols[10] = "7";
    expect(() => parseVouCsv(csv(cols.join(",")), rules)).toThrow(VouParseError);
  });

  it("rejects a row with the wrong column count, naming the line", () => {
    expect(() => parseVouCsv(csv(ROW + ",extra"), rules)).toThrow(/line 2/);
  });

  it("rejects a non-numeric value of use", () => {
    const cols = ROW.split(",");
    cols[18] = "   ";
    expect(() => parseVouCsv(csv(cols.join(",")), rules)).toThrow(VouParseError);
  });

  it("ignores blank lines", () => {
    expect(parseVouCsv(csv(ROW, "", "   "), rules)).toHaveLength(1);
  });
});
