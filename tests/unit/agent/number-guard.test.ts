import { describe, expect, it } from "vitest";
import { checkNumbers, collectAllowed, extractNumbers } from "@/lib/agent";

const values = (text: string, ignore: string[] = []) => extractNumbers(text, ignore).map((n) => n.value);

describe("extractNumbers", () => {
  it("reads thousands separators, decimals, ₪ and %", () => {
    expect(values("הנטו יהיה 11,693 ₪ במקום ₪11,032, פנסיה 6% וקרן 2.5%")).toEqual([11693, 11032, 6, 2.5]);
  });

  it("reads numbers glued to Hebrew letters and signs", () => {
    expect(values("ירידה של −1,938 ₪, ב-250 נטו, +661")).toEqual([1938, 250, 661]);
  });

  it("ignores digits that are part of known names", () => {
    expect(values("ATTO 3 או MG4 או Mazda 3", ["ATTO 3", "MG4", "MAZDA 3"])).toEqual([]);
    expect(values("מעבר ל-Atto 3 יעלה את הנטו ב-661", ["ATTO 3"])).toEqual([661]);
  });

  it("text without numbers has none", () => {
    expect(values("כדי לחשב אני צריך את שכר הבסיס שלך")).toEqual([]);
  });
});

describe("collectAllowed", () => {
  it("collects numeric leaves and numbers inside strings, recursively", () => {
    const allowed = collectAllowed([{ a: 1500, b: [{ c: 3130 }], reason: "מסלול ל-4 ילדים ומעלה" }]);
    for (const n of [1500, 3130, 4]) expect(allowed.has(String(n))).toBe(true);
  });
});

describe("checkNumbers", () => {
  const toolOutputs = [
    { today: { display: { net: 11032 }, valueOfUse: 4070 }, options: [{ display: { net: 11693, diffVsToday: 661 }, electricGross: 439.9123 }] },
  ];

  it("accepts numbers that come from tool outputs", () => {
    const r = checkNumbers("הנטו יעלה מ-11,032 ל-11,693 ₪ (+661).", { toolOutputs });
    expect(r).toEqual({ ok: true, invented: [] });
  });

  it("accepts display forms: whole shekel and up to two decimals", () => {
    expect(checkNumbers("החזר חשמל 440 ₪ (439.91)", { toolOutputs }).ok).toBe(true);
    expect(checkNumbers("הנטו 11,693", { toolOutputs: [{ net: 11693.4 }] }).ok).toBe(true);
  });

  it("accepts a percent shown from a stored fraction", () => {
    expect(checkNumbers("הפרשה לפנסיה 6% ולקרן 2.5%", { toolOutputs: [{ pensionPct: 0.06, studyFundPct: 0.025 }] }).ok).toBe(true);
  });

  it("CATCHES an invented number", () => {
    const r = checkNumbers("הנטו שלך יהיה 12,345 ₪", { toolOutputs });
    expect(r).toEqual({ ok: false, invented: ["12,345"] });
  });

  it("catches a sum the model computed itself", () => {
    // 11,032 + 661 written as if it were a value — not itself in any output
    const r = checkNumbers("יחד זה 11,693 ועוד 4,731", { toolOutputs });
    expect(r.ok).toBe(false);
    expect(r.invented).toEqual(["4,731"]);
  });

  it("catches a tool number from an earlier turn (not in this turn's outputs)", () => {
    const r = checkNumbers("כמו שאמרתי, הנטו 11,693", { toolOutputs: [] });
    expect(r).toEqual({ ok: false, invented: ["11,693"] });
  });

  it("accepts a profile value set in an earlier turn", () => {
    const profile = { childrenUnder23: 3, baseSalary: 14200, pensionPct: 0.06 };
    expect(checkNumbers("רשמתי 3 ילדים, שכר בסיס 14,200 ופנסיה 6%", { toolOutputs: [], profile }).ok).toBe(true);
  });

  it("still catches a raw user number that never made it into the profile", () => {
    const profile = { childrenUnder23: 3 };
    // the employee wrote "בונוס 5,000" but nothing validated it into the profile
    const r = checkNumbers("רשמתי 3 ילדים ובונוס 5,000", { toolOutputs: [], profile });
    expect(r).toEqual({ ok: false, invented: ["5,000"] });
  });

  it("ignores names and passes text without numbers", () => {
    expect(checkNumbers("ATTO 3 זמין בקבוצה שלך", { toolOutputs: [], ignoreNames: ["ATTO 3"] }).ok).toBe(true);
    expect(checkNumbers("מה שכר הבסיס שלך?", { toolOutputs: [] }).ok).toBe(true);
  });
});
