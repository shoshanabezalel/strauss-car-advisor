import { DRIVES, type Drive, type Rules } from "@/lib/config";

/**
 * Parser for the tax-authority value-of-use file ("הקובץ המורחב", data/raw/vou-2026.csv).
 * Pure: bytes/text in, records out. Columns are read by position, not by header name,
 * because the drive-type header ("1-חשמלי.2-היברידי.3-פלג-אין") is wrong.
 */

export interface VouRecord {
  taxYear: number;
  regYear: number;
  vehicleTypeCode: string;
  makeCode: string;
  makeName: string;
  modelCode: string;
  /** תאור דגם — the manufacturer's model description. */
  modelName: string;
  /** כינוי מסחרי — the trade name, e.g. "ATTO 3". */
  tradeName: string;
  driveCode: string;
  drive: Drive;
  listPrice: number;
  valueOfUse: number;
  /** Columns the app doesn't use, kept for reference. */
  raw: VouRaw;
}

export interface VouRaw {
  fuelType: string;
  automatic: string;
  greenScore: string;
  pollutionLevel: string;
  engineCc: string;
  weight: string;
  effectiveDate: string;
  adjustedPrice: number;
}

export const VOU_COLUMN_COUNT = 19;

export class VouParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VouParseError";
  }
}

export function decodeCp1255(bytes: Uint8Array): string {
  return new TextDecoder("windows-1255").decode(bytes);
}

/** Drive code → Drive. Codes follow rules.valueOfUse.driveField: 0 petrol, 1 hybrid, 2 plug-in, 3 electric. */
export function driveFromCode(code: string, rules: Rules): Drive {
  if (!Object.hasOwn(rules.valueOfUse.driveField, code)) {
    throw new VouParseError(`unknown drive code "${code}"`);
  }
  return DRIVES[Number(code)];
}

export function parseVouCsv(text: string, rules: Rules): VouRecord[] {
  const lines = text.split(/\r?\n/);
  const records: VouRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try {
      records.push(parseRow(lines[i], rules));
    } catch (e) {
      throw new VouParseError(`line ${i + 1}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return records;
}

function parseRow(line: string, rules: Rules): VouRecord {
  const f = line.split(",").map((s) => s.trim());
  if (f.length !== VOU_COLUMN_COUNT) {
    throw new VouParseError(`expected ${VOU_COLUMN_COUNT} columns, got ${f.length}`);
  }
  const [
    taxYear, regYear, vehicleTypeCode, makeCode, makeName, modelCode, modelName, fuelType, tradeName,
    automatic, driveCode, greenScore, pollutionLevel, engineCc, weight, effectiveDate, listPrice,
    adjustedPrice, valueOfUse,
  ] = f;
  return {
    taxYear: num(taxYear, "tax year"),
    regYear: num(regYear, "registration year"),
    vehicleTypeCode,
    makeCode,
    makeName,
    modelCode,
    modelName,
    tradeName,
    driveCode,
    drive: driveFromCode(driveCode, rules),
    listPrice: num(listPrice, "list price"),
    valueOfUse: num(valueOfUse, "value of use"),
    raw: {
      fuelType,
      automatic,
      greenScore,
      pollutionLevel,
      engineCc,
      weight,
      effectiveDate,
      adjustedPrice: num(adjustedPrice, "adjusted price"),
    },
  };
}

function num(s: string, field: string): number {
  if (!/^\d+(\.\d+)?$/.test(s)) throw new VouParseError(`${field} is not a number: "${s}"`);
  return Number(s);
}
