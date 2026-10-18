import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rules } from "@/lib/config";
import type { VouSource } from "./lookup";
import { driveFromCode, type VouRaw, type VouRecord } from "./parse";

export const VOU_TABLE = "value_of_use";

const NAME_COLUMNS = ["trade_name", "make_name", "model_name"] as const;
const KEY_ORDER = ["tax_year", "reg_year", "vehicle_type_code", "make_code", "model_code"] as const;

export interface VouRow {
  tax_year: number;
  reg_year: number;
  vehicle_type_code: string;
  make_code: string;
  model_code: string;
  make_name: string;
  model_name: string;
  trade_name: string;
  drive_code: string;
  list_price: number;
  value_of_use: number;
  raw: VouRaw;
}

export function toVouRow(r: VouRecord): VouRow {
  return {
    tax_year: r.taxYear,
    reg_year: r.regYear,
    vehicle_type_code: r.vehicleTypeCode,
    make_code: r.makeCode,
    model_code: r.modelCode,
    make_name: r.makeName,
    model_name: r.modelName,
    trade_name: r.tradeName,
    drive_code: r.driveCode,
    list_price: r.listPrice,
    value_of_use: r.valueOfUse,
    raw: r.raw,
  };
}

export function fromVouRow(row: VouRow, rules: Rules): VouRecord {
  return {
    taxYear: row.tax_year,
    regYear: row.reg_year,
    vehicleTypeCode: row.vehicle_type_code,
    makeCode: row.make_code,
    modelCode: row.model_code,
    makeName: row.make_name,
    modelName: row.model_name,
    tradeName: row.trade_name,
    driveCode: row.drive_code,
    drive: driveFromCode(row.drive_code, rules),
    // numeric columns can come back as strings
    listPrice: Number(row.list_price),
    valueOfUse: Number(row.value_of_use),
    raw: row.raw,
  };
}

/**
 * PostgREST or() filter: case-insensitive substring of trade, make or model name.
 * LIKE wildcards (\ % _) are escaped so the query matches literally, and each value is
 * double-quoted (with " and \ escaped) so commas and parentheses can't break the or() syntax.
 * Note: PostgREST turns `*` in like patterns into `%`, so a `*` only widens the search.
 */
export function buildNameFilter(query: string): string {
  const q = query.trim();
  if (!q) throw new Error("search query is empty");
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = `"${pattern.replace(/["\\]/g, "\\$&")}"`;
  return NAME_COLUMNS.map((c) => `${c}.ilike.${quoted}`).join(",");
}

/** VouSource over the value_of_use table. Pass a server or admin client; the table is readable under demo RLS. */
export function createSupabaseVouSource(client: SupabaseClient, rules: Rules): VouSource {
  const ordered = <T extends { order: (c: string) => T }>(q: T) => KEY_ORDER.reduce((acc, c) => acc.order(c), q);

  const run = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await q;
    if (error) throw new Error(`value_of_use query failed: ${error.message}`);
    return (data as VouRow[]).map((row) => fromVouRow(row, rules));
  };

  return {
    async findByKey(key, limit) {
      let q = client
        .from(VOU_TABLE)
        .select("*")
        .eq("tax_year", key.taxYear)
        .eq("make_code", key.makeCode)
        .eq("model_code", key.modelCode);
      if (key.regYear !== undefined) q = q.eq("reg_year", key.regYear);
      if (key.vehicleTypeCode !== undefined) q = q.eq("vehicle_type_code", key.vehicleTypeCode);
      return run(ordered(q).limit(limit));
    },
    async searchByName(nq, limit) {
      let q = client.from(VOU_TABLE).select("*").eq("tax_year", nq.taxYear).or(buildNameFilter(nq.query));
      if (nq.regYear !== undefined) q = q.eq("reg_year", nq.regYear);
      if (nq.makeCode !== undefined) q = q.eq("make_code", nq.makeCode);
      return run(ordered(q).limit(limit));
    },
  };
}
