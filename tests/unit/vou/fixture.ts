import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRules } from "@/lib/config";
import { decodeCp1255, parseVouCsv, type VouRecord } from "@/lib/vou";

export const VOU_CSV_PATH = join(__dirname, "../../../data/raw/vou-2026.csv");

let cached: VouRecord[] | undefined;
/** The full tax-authority file, parsed once per test worker. */
export function loadVouRecords(): VouRecord[] {
  return (cached ??= parseVouCsv(decodeCp1255(readFileSync(VOU_CSV_PATH)), getRules()));
}
