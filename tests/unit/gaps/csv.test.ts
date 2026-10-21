import { describe, expect, it } from "vitest";
import { gapsToCsv } from "@/lib/gaps/csv";
import type { GapGroup } from "@/lib/gaps/types";

// G add-on: "ייצוא CSV" of the grouped list. UTF-8 with BOM, so Excel opens the Hebrew correctly.
const groups: GapGroup[] = [
  { type: "referred_to_rep", topic: "participation/CAR-10", description: "השתתפות עצמית לא אושרה", vehicle: "BYD ATTO 3", count: 6, lastSeen: "2026-10-21T09:30:00.000Z", resolved: false },
  { type: "no_data", topic: "rules", description: 'שאלה עם "מרכאות", פסיק\nושורה חדשה', count: 3, lastSeen: "2026-10-20T08:00:00.000Z", resolved: true },
  { type: "unknown_vehicle", topic: "vehicle/=cmd", description: "=HYPERLINK(\"x\")", vehicle: "+evil", count: 1, lastSeen: "2026-10-19T08:00:00.000Z", resolved: false },
];

describe("gapsToCsv", () => {
  const csv = gapsToCsv(groups);
  const lines = csv.slice(1).split("\r\n");

  it("starts with the UTF-8 BOM (bytes EF BB BF), and the bytes decode back to the same Hebrew", () => {
    const bytes = Buffer.from(csv, "utf8");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8").decode(bytes)).toBe(csv.startsWith("\uFEFF") ? csv.slice(1) : csv);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("Hebrew header row, CRLF line ends, one line per group", () => {
    expect(lines[0]).toBe("סוג,נושא,רכב,תיאור,פניות,נראה לאחרונה,טופל");
    expect(lines[1]).toBe("הופנה לנציג/ת,השתתפות עצמית: BYD ATTO 3,BYD ATTO 3,השתתפות עצמית לא אושרה,6,2026-10-21 09:30,לא");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("topics are readable labels: no topic keys or catalog ids", () => {
    expect(csv).not.toMatch(/CAR-\d+/);
    expect(csv).not.toContain("participation/");
    expect(lines[2]).toMatch(/^אין מידע,כללי החברה,/);
  });

  it("quotes cells with quotes, commas or newlines (RFC 4180)", () => {
    expect(csv).toContain('"שאלה עם ""מרכאות"", פסיק\nושורה חדשה"');
    expect(csv).toContain(",כן\r\n");
  });

  it("neutralizes cells that Excel would run as formulas (= + - @)", () => {
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",'+evil,");
    expect(csv).not.toMatch(/(^|,)=/m);
  });
});
