import { GAP_TYPE_LABELS, gapLabel } from "./labels";
import type { GapGroup } from "./types";

const HEADER = ["סוג", "נושא", "רכב", "תיאור", "פניות", "נראה לאחרונה", "טופל"];

/** A cell starting with = + - @ would run as a formula in Excel: prefix it with ' (CSV injection guard). */
function cell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** `2026-10-21 09:30` (UTC, sortable; Excel reads it as a date). */
const stamp = (iso: string) => iso.slice(0, 16).replace("T", " ");

/**
 * The rep screen's grouped gaps as CSV (G add-on): UTF-8 with a BOM, so Excel opens the Hebrew correctly, CRLF line
 * ends (RFC 4180), Hebrew headers and type labels.
 */
export function gapsToCsv(groups: readonly GapGroup[]): string {
  const rows = groups.map((g) => [GAP_TYPE_LABELS[g.type], gapLabel(g.type, g.topic, g.vehicle), g.vehicle ?? "", g.description, String(g.count), stamp(g.lastSeen), g.resolved ? "כן" : "לא"]);
  return `\uFEFF${[HEADER, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
