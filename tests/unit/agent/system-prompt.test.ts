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

  it("has the Hebrew glossary terms", () => {
    for (const term of ["שווי שימוש", "השתתפות עצמית", "מסלול משפחה", "ויתור על רכב", "נטו"]) {
      expect(prompt).toContain(term);
    }
  });

  it("contains no digits, so it cannot leak numbers into replies", () => {
    expect(prompt).not.toMatch(/\d/);
  });

  it("stays tight (sent on every turn)", () => {
    expect(prompt.split(/\s+/).length).toBeLessThan(900);
  });
});
