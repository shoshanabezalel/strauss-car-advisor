import { describe, expect, it } from "vitest";
import { loadSystemPrompt, TOOL_NAMES } from "@/lib/agent";

const prompt = loadSystemPrompt();

describe("system prompt", () => {
  it("loads from the repo file", () => {
    expect(prompt.length).toBeGreaterThan(200);
  });

  it("mentions every tool", () => {
    for (const name of TOOL_NAMES) expect(prompt).toContain(name);
  });

  it("states the hard rules explicitly", () => {
    expect(prompt).toMatch(/reply in Hebrew/i);
    expect(prompt).toMatch(/never (compute|calculate)/i);
    expect(prompt).toMatch(/never guess/i);
    for (const signal of ["missing", "ambiguous", "partial", "mustConfirm", "needsConfirmation", "display"]) {
      expect(prompt).toContain(signal);
    }
  });

  it("asks for one updateProfile call and a single catalog lookup", () => {
    expect(prompt).toMatch(/one updateProfile call/i);
    expect(prompt).toMatch(/getCatalog with scope "all" once/i);
  });

  it("phrases the difference as עלייה / ירידה, never with a minus sign", () => {
    expect(prompt).toMatch(/never a minus sign/i);
    expect(prompt).toContain("direction");
  });

  it("has the Hebrew glossary terms", () => {
    for (const term of ["שווי שימוש", "השתתפות עצמית", "מסלול משפחה", "ויתור על רכב", "נטו", "עלייה", "ירידה"]) {
      expect(prompt).toContain(term);
    }
  });

  // F6: the employee may upload a payslip instead of typing; the agent never sees the file.
  it("offers the payslip upload when asking for salary data, without claiming to read it", () => {
    expect(prompt).toMatch(/upload a payslip/i);
    expect(prompt).toContain("תלוש שכר");
    expect(prompt).toMatch(/never see the file/i);
  });

  // The net-change explanation uses only the engine's per-component lines, which sum to the change (user, 21/10).
  it("explains the change only from netDelta, and says value-of-use is taxable, not cash", () => {
    expect(prompt).toContain("netDelta");
    expect(prompt).toMatch(/not cash/i);
    expect(prompt).toMatch(/never (list|add up) gross amounts/i);
    expect(prompt).not.toMatch(/two lines on why, from `changes`/);
  });

  it("contains no digits, so it cannot leak numbers into replies", () => {
    expect(prompt).not.toMatch(/\d/);
  });

  it("stays tight (sent on every turn)", () => {
    expect(prompt.split(/\s+/).length).toBeLessThan(900);
  });
});
