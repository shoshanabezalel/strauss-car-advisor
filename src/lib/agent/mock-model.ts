import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { z } from "zod";
import type { Config, SampleEmployee, Situation } from "@/lib/config";
import {
  ambiguousVouCar,
  ambiguousVouMessage,
  carName,
  missingDataMessage,
  openingMessage,
  UNKNOWN_PARTICIPATION_MESSAGE,
} from "./demo-messages";
import type { CompareOptionsOutput, GetValueOfUseOutput } from "./schemas";
import type { ToolName } from "./tools";

/**
 * Scripted model for local dev and e2e (AGENT_MODEL=mock), when the live model is unreachable.
 * It only decides which tools to call; the real tools and engine produce every number, and the reply quotes
 * the tools' `display` values, so the real number-guard checks it like any model reply.
 */

/** A prompt the demo UI offers in mock mode. */
export interface DemoPrompt {
  id: string;
  label: string;
  text: string;
}

type ToolResults = Partial<Record<ToolName, unknown>>;
interface Scenario extends DemoPrompt {
  calls: { toolName: ToolName; input: unknown }[];
  reply: (results: ToolResults) => string;
}

type Compare = z.output<typeof CompareOptionsOutput>;
type Vou = z.output<typeof GetValueOfUseOutput>;

const fmt = (n: number) => n.toLocaleString("en-US");

const CHANGE_WORDS: Record<string, string> = {
  valueOfUse: "שווי השימוש משתנה",
  electric: "נוסף החזר חשמל מגולם",
  maintenance: "אחזקת הרכב משתנה",
  participation: "ההשתתפות העצמית משתנה",
  familyGap: "חלקך בפער של מסלול משפחה ברוכת ילדים",
};

const FALLBACK_REPLY =
  "אני במצב הדגמה ועונה רק על השאלות המוכנות. אפשר לבחור אחת מהן מתחת לשיחה, או לשאול את נציג/ת הרכב.";

function compareReply(results: ToolResults): string {
  const c = results.compareOptions as Compare | undefined;
  const opt = c?.options[0];
  if (!c || !opt) return "לא הצלחתי לחשב את ההשוואה. אפשר לנסות שוב?";
  if (!opt.eligibility.eligible) return `האפשרות הזו לא זמינה עבורך: ${opt.eligibility.reason}`;
  const { net, diffVsToday, direction } = opt.display;
  if (net === undefined || diffVsToday === undefined || c.today.display.net === undefined) {
    return "חסרים לי עוד פרטים כדי לחשב את הנטו. אפשר להשלים אותם?";
  }
  const change =
    direction === "none" ? "ללא שינוי" : `${direction === "up" ? "עלייה" : "ירידה"} של ${fmt(Math.abs(diffVsToday))} ₪`;
  const lines = [`הנטו החדש שלך: ${fmt(net)} ₪, ${change} לעומת היום (${fmt(c.today.display.net)} ₪).`];
  const why = [...new Set(opt.changes.map((ch) => CHANGE_WORDS[ch.kind]).filter(Boolean))];
  if (why.length) lines.push(`מה משתנה: ${why.join(", ")}.`);
  if (opt.needsConfirmation) lines.push("ההשתתפות העצמית ברכב החדש לפי ברירת המחדל בקטלוג, וצריך לאשר אותה מול נציג/ת הרכב.");
  return lines.join("\n");
}

/** The alternative without participation, so a new car takes the catalog default and is flagged for confirmation. */
function requested(s: Situation): Situation {
  return s.kind === "car" ? { kind: "car", carId: s.carId } : s;
}

function employeeScenario(config: Config, e: SampleEmployee): Scenario {
  const p = e.profile;
  const asSaid = (f: number) => +(f * 100).toFixed(4); // percent as the employee says it; the tool converts back
  const updates = [
    { field: "occupation", value: p.occupation },
    { field: "group", value: p.group },
    { field: "baseSalary", value: p.baseSalary },
    { field: "commissions", value: p.commissions },
    { field: "bonus", value: p.bonus },
    { field: "pensionPct", value: asSaid(p.pensionPct) },
    { field: "studyFundPct", value: asSaid(p.studyFundPct) },
    { field: "creditPoints", value: p.creditPoints },
    { field: "childrenUnder23", value: p.childrenUnder23 },
    { field: "current", value: p.current },
  ].map((u) => ({ ...u, source: "employee" }));
  const alt = e.alternative.kind === "car" ? carName(config, e.alternative.carId) : "ויתור על הרכב";
  return {
    id: e.id,
    label: `${e.name}: ${alt}`,
    text: openingMessage(config, e),
    calls: [
      { toolName: "updateProfile", input: { updates } },
      { toolName: "compareOptions", input: { options: [requested(e.alternative)] } },
    ],
    reply: compareReply,
  };
}

function buildScenarios(config: Config): Scenario[] {
  const vouCar = ambiguousVouCar(config);
  return [
    ...config.employees.employees.map((e) => employeeScenario(config, e)),
    {
      id: "missing",
      label: "פרטים חסרים",
      text: missingDataMessage(config),
      calls: [{ toolName: "updateProfile", input: { updates: [{ field: "group", value: config.employees.employees[0].profile.group, source: "employee" }] } }],
      reply: () => "רשמתי את קבוצת הזכאות. כדי לחשב אני צריך/ה עוד כמה פרטים: מה שכר הבסיס שלך, ואיזה רכב יש לך היום?",
    },
    {
      id: "rep",
      label: "השתתפות לא ידועה",
      text: UNKNOWN_PARTICIPATION_MESSAGE,
      calls: [
        {
          toolName: "askRepresentative",
          input: { question: "מה ההשתתפות העצמית של העובד/ת ברכב הנוכחי?", field: "current", context: { reason: "employee_does_not_know" } },
        },
      ],
      reply: () => "שלחתי את השאלה לנציג/ת הרכב. ההשוואה תתעדכן כשתגיע תשובה.",
    },
    {
      id: "ambiguous",
      label: "שווי שימוש לא חד-משמעי",
      text: ambiguousVouMessage(config),
      calls: [{ toolName: "getValueOfUse", input: { makeCode: vouCar.makeCode, modelCode: vouCar.modelCode, regYear: vouCar.regYear } }],
      reply: (r) => {
        const v = r.getValueOfUse as Vou | undefined;
        if (v?.status === "ambiguous") {
          const names = [...new Set(v.candidates.map((c) => c.tradeName || c.modelName))].join(" / ");
          return `מצאתי יותר מדגם אחד עם הקודים האלה: ${names}. איזה מהם הרכב שלך?`;
        }
        if (v?.status === "found") return `שווי השימוש לפי רשות המסים: ${fmt(v.value)} ₪.`;
        return "לא מצאתי את הרכב בטבלת שווי השימוש. אעביר את השאלה לנציג/ת הרכב.";
      },
    },
  ];
}

export function demoPrompts(config: Config): DemoPrompt[] {
  return buildScenarios(config).map(({ id, label, text }) => ({ id, label, text }));
}

type CallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** The last user message's text, and the tool results that came after it (this turn). */
function readTurn(prompt: CallOptions["prompt"]) {
  const lastUser = prompt.findLastIndex((m) => m.role === "user");
  const userMsg = prompt[lastUser];
  const text =
    userMsg && userMsg.role === "user"
      ? userMsg.content.map((p) => (p.type === "text" ? p.text : "")).join("").trim()
      : "";
  const results: ToolResults = {};
  let count = 0;
  for (const m of prompt.slice(lastUser + 1)) {
    if (m.role !== "tool") continue;
    for (const part of m.content) {
      if (part.type !== "tool-result") continue;
      count++;
      if (part.output.type === "json") results[part.toolName as ToolName] = part.output.value;
    }
  }
  return { text, results, count };
}

/** `delayMs` per model step makes progress visible in demos and e2e (a real model takes seconds). */
export function createMockModel(config: Config, { delayMs = 0 }: { delayMs?: number } = {}): LanguageModel {
  const scenarios = buildScenarios(config);
  let callId = 0;
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "mock",
    doGenerate: async ({ prompt }): Promise<GenerateResult> => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const { text, results, count } = readTurn(prompt);
      const scenario = scenarios.find((s) => s.text === text);
      const next = scenario?.calls[count];
      if (next) {
        return {
          content: [{ type: "tool-call", toolCallId: `mock-${++callId}`, toolName: next.toolName, input: JSON.stringify(next.input) }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        };
      }
      const reply = scenario ? scenario.reply(results) : FALLBACK_REPLY;
      return { content: [{ type: "text", text: reply }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });
}
