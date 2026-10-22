import { describe, expect, it } from "vitest";
import { formatNumberInput, groupShekelAmounts, parseNumberInput } from "@/lib/format/amounts";
import { checkNumbers } from "@/lib/agent/number-guard";

describe("groupShekelAmounts (agent replies)", () => {
  it("adds thousands separators to amounts next to ₪", () => {
    expect(groupShekelAmounts("הנטו החדש: 12026 ₪, עלייה של 661 ₪.")).toBe("הנטו החדש: 12,026 ₪, עלייה של 661 ₪.");
    expect(groupShekelAmounts("₪12026 ו-₪ 1234567")).toBe("₪12,026 ו-₪ 1,234,567");
    expect(groupShekelAmounts("4070 ש״ח")).toBe("4,070 ש״ח");
  });

  it("keeps decimals, already grouped amounts and numbers that aren't amounts", () => {
    expect(groupShekelAmounts("1234.5 ₪")).toBe("1,234.5 ₪");
    expect(groupShekelAmounts("12,026 ₪")).toBe("12,026 ₪");
    expect(groupShekelAmounts("שנת המס 2026, דגם 2025, קוד 01014")).toBe("שנת המס 2026, דגם 2025, קוד 01014");
  });

  it("the grouped reply still passes the number-guard", () => {
    const text = groupShekelAmounts("הנטו החדש: 12026 ₪.");
    expect(checkNumbers(text, { toolOutputs: [{ net: 12026.4 }] }).ok).toBe(true);
  });
});

describe("number inputs", () => {
  it("formats on blur", () => {
    expect(formatNumberInput("18000")).toBe("18,000");
    expect(formatNumberInput("18,000")).toBe("18,000");
    expect(formatNumberInput("1234567.25")).toBe("1,234,567.25");
    expect(formatNumberInput("6.5")).toBe("6.5");
    expect(formatNumberInput("")).toBe("");
    expect(formatNumberInput("abc")).toBe("abc");
  });

  it("parses back on save", () => {
    expect(parseNumberInput("18,000")).toBe(18000);
    expect(parseNumberInput(" 2.25 ")).toBe(2.25);
    expect(parseNumberInput("abc")).toBeNaN();
  });
});
