import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPLOYEE_TOUR, REP_TOUR, type TourStep } from "@/lib/tour/steps";
import { BUBBLE_GAP, GUTTER, hasSeen, markSeen, placeBubble, selectorFor, stepContent, type TourStorage } from "@/lib/tour/tour";
import { tourSeenState } from "../../e2e/helpers";

// Onboarding tour (docs/TOUR.md, approved 21/10): texts and steps are fixed by the doc, the rest is pure layout and
// storage logic the client component calls.

/** The "Bubble" and "If the target is missing" columns of one screen's table in docs/TOUR.md. */
function docTable(heading: string): { text: string; fallback?: string }[] {
  const doc = readFileSync("docs/TOUR.md", "utf8");
  const section = doc.split(/^## /m).find((s) => s.startsWith(heading));
  if (!section) throw new Error(`no section ${heading}`);
  return section
    .split("\n")
    .filter((l) => /^\| \d+ \|/.test(l))
    .map((l) => {
      const cells = l.split("|").slice(1, -1).map((c) => c.trim());
      return { text: cells[3], ...(cells[4] ? { fallback: cells[4] } : {}) };
    });
}

const texts = (steps: TourStep[]) => steps.map((s) => ({ text: s.text, ...(s.fallback ? { fallback: s.fallback } : {}) }));

describe("tour steps", () => {
  it("match the employee table in docs/TOUR.md exactly", () => {
    expect(docTable("Employee screen")).toHaveLength(7);
    expect(texts(EMPLOYEE_TOUR)).toEqual(docTable("Employee screen"));
  });

  it("match the rep table in docs/TOUR.md exactly", () => {
    expect(docTable("Rep screen")).toHaveLength(6);
    expect(texts(REP_TOUR)).toEqual(docTable("Rep screen"));
  });

  it("use data-tour selectors where the doc adds them, and end on the help button", () => {
    expect(EMPLOYEE_TOUR.map((s) => selectorFor(s, true))).toEqual([
      '[data-tour="welcome"]',
      '[data-tour="chat-input"]',
      '[data-tour="payslip-chat"]',
      '[data-testid="profile-panel"]',
      '[data-testid="option-picker"]',
      '[data-tour="comparison"]',
      '[data-tour="tour-help"]',
    ]);
    expect(REP_TOUR.map((s) => selectorFor(s, true))).toEqual([
      '[data-tour="rep-welcome"]',
      '[data-testid="rep-tab-questions"]',
      '[data-testid="rep-tab-gaps"]',
      '[data-testid="rep-question"]',
      '[data-testid="answer-form"]',
      '[data-tour="tour-help"]',
    ]);
  });

  it("points the profile step at the toggle on phones", () => {
    const profile = EMPLOYEE_TOUR[3];
    expect(selectorFor(profile, true)).toBe('[data-testid="profile-panel"]');
    expect(selectorFor(profile, false)).toBe('[data-testid="profile-toggle"]');
  });

  it("uses only plural or neutral forms (no /י or /ת)", () => {
    for (const s of [...EMPLOYEE_TOUR, ...REP_TOUR]) {
      expect(`${s.text} ${s.fallback ?? ""}`).not.toMatch(/\/[ית]/);
    }
  });
});

describe("stepContent", () => {
  const withFallback = EMPLOYEE_TOUR[4];
  const withoutFallback = EMPLOYEE_TOUR[0];

  it("shows the bubble text next to a found target", () => {
    expect(stepContent(withFallback, true)).toEqual({ text: withFallback.text, centered: false });
  });

  it("centers the fallback text when the target is missing", () => {
    expect(stepContent(withFallback, false)).toEqual({ text: withFallback.fallback, centered: true });
  });

  it("centers the bubble text when a step without a fallback has no target", () => {
    expect(stepContent(withoutFallback, false)).toEqual({ text: withoutFallback.text, centered: true });
  });
});

describe("seen flag", () => {
  function memory(): TourStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }
  const throwing: TourStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };

  it("is unset on a first visit and set after markSeen, per screen", () => {
    const s = memory();
    expect(hasSeen("employee", () => s)).toBe(false);
    markSeen("employee", () => s);
    expect(hasSeen("employee", () => s)).toBe(true);
    expect(hasSeen("rep", () => s)).toBe(false);
  });

  it("matches the e2e storage seed, so other specs start with the tour seen on both screens", () => {
    const s = memory();
    markSeen("employee", () => s);
    markSeen("rep", () => s);
    const [origin] = tourSeenState("http://127.0.0.1:3100").origins;
    expect(origin.localStorage).toEqual([...s.data].map(([name, value]) => ({ name, value })));
  });

  it("never throws when storage is blocked or missing", () => {
    expect(hasSeen("employee", () => throwing)).toBe(false);
    expect(() => markSeen("employee", () => throwing)).not.toThrow();
    const accessorThrows = () => {
      throw new Error("blocked");
    };
    expect(hasSeen("employee", accessorThrows)).toBe(false);
    expect(() => markSeen("employee", accessorThrows)).not.toThrow();
    expect(hasSeen("employee", () => undefined)).toBe(false);
  });
});

describe("placeBubble", () => {
  const desktop = { width: 1280, height: 800 };
  const phone = { width: 375, height: 667 };
  const bubble = { width: 320, height: 160 };

  it("goes below the target, aligned to its right edge (RTL)", () => {
    const target = { top: 100, left: 600, width: 400, height: 40 };
    expect(placeBubble(target, desktop, bubble)).toEqual({ top: 140 + BUBBLE_GAP, left: 1000 - 320, arrow: "up" });
  });

  it("goes above when there is no room below", () => {
    const target = { top: 700, left: 600, width: 400, height: 60 };
    expect(placeBubble(target, desktop, bubble)).toEqual({ top: 700 - BUBBLE_GAP - 160, left: 680, arrow: "down" });
  });

  it("stays inside the gutter on a phone", () => {
    const nearLeft = { top: 100, left: 0, width: 40, height: 40 };
    expect(placeBubble(nearLeft, phone, bubble).left).toBe(GUTTER);
    const wide = { top: 100, left: 0, width: 375, height: 40 };
    const { left } = placeBubble(wide, phone, { width: 343, height: 160 });
    expect(left).toBe(GUTTER);
    expect(left + 343).toBeLessThanOrEqual(phone.width - GUTTER);
  });

  it("keeps a tall target's bubble on screen", () => {
    const tall = { top: -200, left: 100, width: 600, height: 2000 };
    const { top } = placeBubble(tall, desktop, bubble);
    expect(top).toBeGreaterThanOrEqual(GUTTER);
    expect(top + bubble.height).toBeLessThanOrEqual(desktop.height - GUTTER);
  });
});
