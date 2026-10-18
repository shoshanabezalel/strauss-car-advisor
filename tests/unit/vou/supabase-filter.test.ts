import { describe, expect, it } from "vitest";
import { buildNameFilter } from "@/lib/vou";

/**
 * Split a PostgREST or() filter on top-level commas, honouring double-quoted values
 * and backslash escapes inside them.
 */
function splitConditions(filter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < filter.length; i++) {
    const ch = filter[i];
    if (quoted && ch === "\\") {
      cur += ch + filter[++i];
    } else if (ch === '"') {
      quoted = !quoted;
      cur += ch;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** The pattern PostgREST hands to ILIKE, after it unquotes the value. */
function patternOf(condition: string): string {
  const m = condition.match(/^\w+\.ilike\."((?:[^"\\]|\\.)*)"$/);
  if (!m) throw new Error(`not a quoted ilike condition: ${condition}`);
  return m[1].replace(/\\(.)/g, "$1");
}

const COLUMNS = ["trade_name", "make_name", "model_name"];

describe("buildNameFilter", () => {
  it("searches trade, make and model names", () => {
    const conds = splitConditions(buildNameFilter("atto"));
    expect(conds.map((c) => c.split(".")[0])).toEqual(COLUMNS);
    for (const c of conds) expect(patternOf(c)).toBe("%atto%");
  });

  it("parentheses stay inside quoted values: exactly 3 conditions", () => {
    const conds = splitConditions(buildNameFilter("ATTO 3 (EV)"));
    expect(conds).toHaveLength(3);
    for (const c of conds) expect(patternOf(c)).toBe("%ATTO 3 (EV)%");
  });

  it("a comma in the query is quoted, not a separator", () => {
    const conds = splitConditions(buildNameFilter("a,b"));
    expect(conds).toHaveLength(3);
    for (const c of conds) expect(patternOf(c)).toBe("%a,b%");
  });

  it("LIKE wildcards are escaped in all three fields", () => {
    const conds = splitConditions(buildNameFilter("50%_x"));
    expect(conds).toHaveLength(3);
    for (const c of conds) expect(patternOf(c)).toBe("%50\\%\\_x%");
  });

  it("double quotes and backslashes are escaped", () => {
    const conds = splitConditions(buildNameFilter('ש"ח\\x'));
    expect(conds).toHaveLength(3);
    // Backslash is LIKE-escaped (\\) and the quote survives unquoting.
    for (const c of conds) expect(patternOf(c)).toBe('%ש"ח\\\\x%');
  });

  it("trims the query and rejects an empty one", () => {
    expect(patternOf(splitConditions(buildNameFilter("  atto  "))[0])).toBe("%atto%");
    expect(() => buildNameFilter("  ")).toThrow(/query/);
  });
});
