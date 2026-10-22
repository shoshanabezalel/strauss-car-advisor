import { describe, expect, it } from "vitest";
import { GAP_TYPE_LABELS } from "@/lib/gaps/labels";
import { GAP_TYPES } from "@/lib/gaps/types";

// User 22/10: "הופנה לצוות הרכב" only for questions actually sent; a catalog-default participation is waiting.
describe("gap type labels", () => {
  it("every type has its own Hebrew label", () => {
    expect(new Set(GAP_TYPES.map((t) => GAP_TYPE_LABELS[t])).size).toBe(GAP_TYPES.length);
  });

  it("separates a sent question from a participation waiting for confirmation", () => {
    expect(GAP_TYPE_LABELS.referred_to_rep).toBe("הופנה לצוות הרכב");
    expect(GAP_TYPE_LABELS.pending_confirmation).toBe("ממתין לאישור צוות הרכב");
  });
});
