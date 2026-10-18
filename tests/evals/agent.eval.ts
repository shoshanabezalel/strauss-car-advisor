import type { ModelMessage } from "ai";
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { createAgentState, createMemoryRepQueue, runAgentTurn, type AgentDeps, type AgentTurn } from "@/lib/agent";
import { createAgentModel } from "@/lib/agent/model";
import { loadConfig, type SampleEmployee, type Situation } from "@/lib/config";
import { createMemoryVouSource } from "@/lib/vou";
import { loadVouRecords } from "../unit/vou/fixture";
import { rateLimited } from "./rate-limit";

// Live evals (`npm run eval:agent`): the real model drives the tools from a Hebrew chat. Not part of `npm test`.
loadEnv({ path: ".env.local", quiet: true });
const hasKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const config = loadConfig();
const MAX_TURNS = 3;
const FOLLOW_UP = "כן, הכול נכון. תחשב בבקשה.";

const carName = (id: string) => {
  const c = config.catalog.cars.find((x) => x.id === id)!;
  return `${c.make} ${c.model}`;
};
const pct = (f: number) => +(f * 100).toFixed(2); // test-data phrasing only

function describeSituation(s: Situation): string {
  if (s.kind === "waiver") return "היום ויתרתי על רכב ואני מקבל/ת אחזקת רכב.";
  const p = s.participation !== undefined ? ` עם השתתפות עצמית של ${s.participation} ₪` : "";
  return `היום יש לי ${carName(s.carId)}${p}.`;
}

/** One Hebrew message with the whole profile and the employee's question, as an employee might write it. */
function openingMessage(e: SampleEmployee): string {
  const p = e.profile;
  return [
    `שלום, אני ${p.occupation}, קבוצת זכאות ${p.group}.`,
    `שכר בסיס ${p.baseSalary} ₪, עמלות ${p.commissions} ₪, בונוס ${p.bonus} ₪.`,
    `הפרשה לפנסיה ${pct(p.pensionPct)}% ולקרן השתלמות ${pct(p.studyFundPct)}%.`,
    `יש לי ${p.creditPoints} נקודות זיכוי ו-${p.childrenUnder23} ילדים עד גיל עשרים ושלוש.`,
    describeSituation(p.current),
    e.question,
  ].join(" ");
}

function newDeps(): AgentDeps {
  return { config, vouSource: createMemoryVouSource(loadVouRecords()), state: createAgentState(), repQueue: createMemoryRepQueue() };
}

/** Chat until a turn produces a net for a requested option, or MAX_TURNS. Every turn must pass the guard. */
async function chat(first: string, deps: AgentDeps, done: (t: AgentTurn) => boolean) {
  const model = rateLimited(createAgentModel());
  let messages: ModelMessage[] = [{ role: "user", content: first }];
  const turns: AgentTurn[] = [];
  for (let i = 0; i < MAX_TURNS; i++) {
    const turn = await runAgentTurn({ model, messages, deps, maxRetries: 0 });
    turns.push(turn);
    console.log(`[eval] turn ${i + 1}: tools=${turn.toolCalls.map((c) => c.toolName).join(",")} guard=${turn.guard.ok}\n${turn.text}`);
    if (done(turn)) break;
    messages = [...messages, ...turn.responseMessages, { role: "user", content: FOLLOW_UP }];
  }
  return turns;
}

const hasOptionNet = (t: AgentTurn) =>
  t.toolOutputs.some(
    (o) => o.toolName === "compareOptions" && (o.output as { options: { display: { net?: number } }[] }).options.some((r) => r.display.net !== undefined),
  );

const firstLine = (text: string) => text.split("\n").find((l) => l.trim()) ?? "";
const mentions = (text: string, n: number) => text.includes(n.toLocaleString("en-US")) || text.includes(String(n));

describe.skipIf(!hasKey)("agent evals (live model)", () => {
  for (const e of config.employees.employees) {
    it(`${e.id}: reaches the sheet's net via chat, with no invented numbers`, async () => {
      const deps = newDeps();
      const turns = await chat(openingMessage(e), deps, hasOptionNet);
      const last = turns.at(-1)!;

      for (const t of turns) expect(t.blocked, `blocked: ${t.guard.invented.join(", ")}`).toBe(false);
      const called = turns.flatMap((t) => t.toolCalls.map((c) => c.toolName));
      expect(called).toContain("updateProfile");
      expect(called).toContain("compareOptions");
      // Efficiency (prompt): the full profile goes in one updateProfile call; at most one catalog lookup.
      expect(called.filter((n) => n === "updateProfile"), called.join(",")).toHaveLength(1);
      expect(called.filter((n) => n === "getCatalog").length, called.join(",")).toBeLessThanOrEqual(1);

      // Prompt rule: the first line after compareOptions states the new net and the diff, from display.
      const line = firstLine(last.text);
      expect(mentions(line, e.expected.netAlt), `first line: ${line}`).toBe(true);
      expect(mentions(line, Math.abs(e.expected.diff)), `first line: ${line}`).toBe(true);
      // Phrasing: עלייה / ירידה with the absolute value, never a minus sign.
      expect(line).toContain(e.expected.diff > 0 ? "עלייה" : "ירידה");
      expect(line, `first line: ${line}`).not.toMatch(/(?<![\u0590-\u05FF])[-−]\s*\d/); // "ל-5,078" is a Hebrew prefix, not a sign

      if (e.alternative.kind === "car") {
        const carId = e.alternative.carId;
        expect(last.notices).toContainEqual({ kind: "participation_unconfirmed", carId });
        expect(last.text).toContain("השתתפות");
      }
    });
  }

  it("A12: unknown participation for a new car → flagged or sent to the representative, no invented number", async () => {
    const e = config.employees.employees[0];
    const deps = newDeps();
    const msg = `${openingMessage(e).replace(e.question, "")} אני שוקל/ת לעבור ל-${carName("CAR-11")}, אבל אין לי מושג מה ההשתתפות העצמית בו.`;
    const turns = await chat(msg, deps, hasOptionNet);
    for (const t of turns) expect(t.blocked).toBe(false);
    const notices = turns.flatMap((t) => t.notices);
    const askedRep = turns.some((t) => t.toolCalls.some((c) => c.toolName === "askRepresentative"));
    expect(askedRep || notices.some((n) => n.kind === "participation_unconfirmed")).toBe(true);
    expect(turns.at(-1)!.text).toContain("השתתפות");
  });

  it("A12: a car outside the catalog → lookup or representative, never a made-up comparison", async () => {
    const e = config.employees.employees[0];
    const deps = newDeps();
    const msg = `${openingMessage(e).replace(e.question, "")} מה יקרה לנטו אם אקח פולקסווגן ID.7 במקום הרכב הנוכחי?`;
    const turns = await chat(msg, deps, () => true);
    const t = turns[0];
    expect(t.blocked).toBe(false);
    const called = t.toolCalls.map((c) => c.toolName);
    expect(called.some((n) => ["searchValueOfUse", "getValueOfUse", "askRepresentative", "getCatalog"].includes(n))).toBe(true);
  });
});
