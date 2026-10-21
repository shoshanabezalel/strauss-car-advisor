import { describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, createToolHandlers, loadSystemPrompt, TOOL_NAMES } from "@/lib/agent";
import { loadConfig } from "@/lib/config";
import { createMemoryGapLog } from "@/lib/gaps/types";
import { createMemoryVouSource } from "@/lib/vou";

// G: the agent logs a no_data gap whenever it tells the employee it has no information.
const config = loadConfig();

function setup() {
  const gapLog = createMemoryGapLog();
  const h = createToolHandlers({ config, vouSource: createMemoryVouSource([]), state: createAgentState(), repQueue: createMemoryRepQueue(), gapLog });
  return { h, gapLog };
}

describe("logInformationGap tool", () => {
  it("is offered to the model, and the prompt tells it when to call it", () => {
    expect(TOOL_NAMES).toContain("logInformationGap");
    expect(loadSystemPrompt()).toMatch(/logInformationGap/);
  });

  it("stores a no_data gap with the topic and description", async () => {
    const { h, gapLog } = setup();
    expect(await h.logInformationGap({ topic: "rules", description: "כיסוי ביטוחי לרכב בזמן חופשת לידה" })).toEqual({ ok: true });
    expect(gapLog.gaps).toEqual([{ type: "no_data", topic: "rules", description: "כיסוי ביטוחי לרכב בזמן חופשת לידה" }]);
  });

  it("rejects a description with digits (no salaries, amounts or ids), an unknown topic, and an over-long text", async () => {
    const { h, gapLog } = setup();
    await expect(h.logInformationGap({ topic: "rules", description: "עובד עם שכר 18500 שואל על ביטוח" })).rejects.toThrow();
    await expect(h.logInformationGap({ topic: "salary" as never, description: "שאלה" })).rejects.toThrow();
    await expect(h.logInformationGap({ topic: "rules", description: "א".repeat(121) })).rejects.toThrow();
    expect(gapLog.gaps).toEqual([]);
  });
});
