import type { Rules } from "@/lib/config";
import type { VouRecord } from "./parse";

/** Full value-of-use key (rules.valueOfUse.key). Without vehicleTypeCode there are collisions (ATTO 3 / TANG). */
export interface VouKey {
  taxYear: number;
  regYear: number;
  vehicleTypeCode: string;
  makeCode: string;
  modelCode: string;
}

/** What a caller may know: make + model codes are required; the rest narrows the match. taxYear defaults from rules. */
export type VouKeyQuery = Partial<VouKey> & Pick<VouKey, "makeCode" | "modelCode">;

export interface VouNameQuery {
  /** Case-insensitive substring of the trade, make or model name. */
  query: string;
  taxYear?: number;
  regYear?: number;
  makeCode?: string;
  limit?: number;
}

/** Storage behind the lookup. Results are ordered by key; at most `limit` rows. */
export interface VouSource {
  findByKey(key: Partial<VouKey> & Pick<VouKey, "taxYear" | "makeCode" | "modelCode">, limit: number): Promise<VouRecord[]>;
  searchByName(q: { query: string; taxYear: number; regYear?: number; makeCode?: string }, limit: number): Promise<VouRecord[]>;
}

export type VouLookupResult =
  /** matchedBy 'partial': part of the key was missing but only one row matched — confirm with the user before use. */
  | { status: "found"; value: number; record: VouRecord; matchedBy: "key" | "partial" }
  | { status: "ambiguous"; candidates: VouRecord[]; truncated: boolean }
  | { status: "not_found" };

export type VouSearchResult =
  | { status: "candidates"; candidates: VouRecord[]; truncated: boolean }
  | { status: "not_found" };

export const DEFAULT_CANDIDATE_LIMIT = 20;

/** Look up by key. Never picks among several rows: two or more matches → ambiguous. */
export async function getValueOfUse(q: VouKeyQuery, source: VouSource, rules: Rules): Promise<VouLookupResult> {
  const key = { ...q, taxYear: q.taxYear ?? rules.valueOfUse.taxYear };
  const rows = await source.findByKey(key, DEFAULT_CANDIDATE_LIMIT + 1);
  if (rows.length === 0) return { status: "not_found" };
  if (rows.length === 1) {
    const full = key.regYear !== undefined && key.vehicleTypeCode !== undefined;
    return { status: "found", value: rows[0].valueOfUse, record: rows[0], matchedBy: full ? "key" : "partial" };
  }
  return capped("ambiguous", rows, DEFAULT_CANDIDATE_LIMIT);
}

/** Search by name. Always returns candidates for the user to choose from, never a single picked value. */
export async function searchValueOfUse(q: VouNameQuery, source: VouSource, rules: Rules): Promise<VouSearchResult> {
  const query = q.query.trim();
  if (!query) throw new Error("search query is empty");
  const limit = q.limit ?? DEFAULT_CANDIDATE_LIMIT;
  const rows = await source.searchByName(
    { query, taxYear: q.taxYear ?? rules.valueOfUse.taxYear, regYear: q.regYear, makeCode: q.makeCode },
    limit + 1,
  );
  if (rows.length === 0) return { status: "not_found" };
  return capped("candidates", rows, limit);
}

function capped<S extends string>(status: S, rows: VouRecord[], limit: number) {
  return { status, candidates: rows.slice(0, limit), truncated: rows.length > limit };
}

export function compareByKey(a: VouRecord, b: VouRecord): number {
  return (
    a.taxYear - b.taxYear ||
    a.regYear - b.regYear ||
    a.vehicleTypeCode.localeCompare(b.vehicleTypeCode) ||
    a.makeCode.localeCompare(b.makeCode) ||
    a.modelCode.localeCompare(b.modelCode)
  );
}
