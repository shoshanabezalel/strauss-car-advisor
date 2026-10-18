import { compareByKey, type VouSource } from "./lookup";
import type { VouRecord } from "./parse";

/** In-memory VouSource over parsed records (tests, scripts). Name matching is a literal substring. */
export function createMemoryVouSource(records: VouRecord[]): VouSource {
  const sorted = [...records].sort(compareByKey);
  return {
    async findByKey(key, limit) {
      return sorted
        .filter(
          (r) =>
            r.taxYear === key.taxYear &&
            r.makeCode === key.makeCode &&
            r.modelCode === key.modelCode &&
            (key.regYear === undefined || r.regYear === key.regYear) &&
            (key.vehicleTypeCode === undefined || r.vehicleTypeCode === key.vehicleTypeCode),
        )
        .slice(0, limit);
    },
    async searchByName(q, limit) {
      const needle = q.query.toLowerCase();
      const out: VouRecord[] = [];
      for (const r of sorted) {
        if (out.length >= limit) break;
        if (r.taxYear !== q.taxYear) continue;
        if (q.regYear !== undefined && r.regYear !== q.regYear) continue;
        if (q.makeCode !== undefined && r.makeCode !== q.makeCode) continue;
        if ([r.tradeName, r.makeName, r.modelName].some((s) => s.toLowerCase().includes(needle))) out.push(r);
      }
      return out;
    },
  };
}
