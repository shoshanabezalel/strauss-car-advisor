import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { z } from "zod";
import type { Config, Situation } from "@/lib/config";
import {
  ambiguousVouCar,
  ambiguousVouMessage,
  ASK_REP_MESSAGE,
  carName,
  challengeOpeningMessage,
  FIND_EV_MESSAGE,
  missingDataMessage,
  openingMessage,
  NO_DATA_MESSAGE,
  UNKNOWN_PARTICIPATION_MESSAGE,
} from "./demo-messages";
import { compareReply, findReply } from "./replies";
import type { CompareOptionsOutput, FindOptionsOutput, GetValueOfUseOutput } from "./schemas";
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

type CallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
type Prompt = CallOptions["prompt"];

type ToolResults = Partial<Record<ToolName, unknown>>;
type Call = { toolName: ToolName; input: unknown };
interface Scenario extends DemoPrompt {
  /** Fixed calls, or calls that depend on the conversation so far (e.g. the car from an earlier comparison). */
  calls: Call[] | ((prompt: Prompt) => Call[]);
  reply: (results: ToolResults, prompt: Prompt) => string;
}

type Compare = z.output<typeof CompareOptionsOutput>;
type Vou = z.output<typeof GetValueOfUseOutput>;

const fmt = (n: number) => n.toLocaleString("en-US");

const FALLBACK_REPLY =
  "אני במצב הדגמה ועונה רק על השאלות המוכנות. אפשר לבחור אחת מהן מתחת לשיחה, או לשאול את צוות הרכב.";

const compareFromResults = (results: ToolResults) => compareReply(results.compareOptions as Compare | undefined);

/** The alternative without participation, so a new car takes the catalog default and is flagged for confirmation. */
function requested(s: Situation): Situation {
  return s.kind === "car" ? { kind: "car", carId: s.carId } : s;
}

type StatedProfile = Config["challenge"]["profile"];

/** updateProfile with everything stated, then compareOptions for the alternative. */
function profileScenario(prompt: DemoPrompt, p: StatedProfile, alternative: Situation): Scenario {
  const asSaid = (f: number) => +(f * 100).toFixed(4); // percent as the employee says it; the tool converts back
  // The model-facing shape: every stated field as a named property, percents as said.
  const profile = { ...p, pensionPct: asSaid(p.pensionPct), studyFundPct: asSaid(p.studyFundPct) };
  return {
    ...prompt,
    calls: [
      { toolName: "updateProfile", input: { source: "employee", profile } },
      { toolName: "compareOptions", input: { options: [requested(alternative)] } },
    ],
    reply: compareFromResults,
  };
}

/** Every tool result in the conversation so far, oldest first. */
function allToolResults(prompt: Prompt): { toolName: string; value: unknown }[] {
  return prompt.flatMap((m) =>
    m.role === "tool"
      ? m.content.flatMap((part) => (part.type === "tool-result" && part.output.type === "json" ? [{ toolName: part.toolName, value: part.output.value }] : []))
      : [],
  );
}

/** The car of the latest comparison whose participation is still the unconfirmed catalog default. */
function unconfirmedCar(prompt: Prompt): string | undefined {
  const last = allToolResults(prompt).findLast((r) => r.toolName === "compareOptions")?.value as Compare | undefined;
  const opt = last?.options.find((o) => o.needsConfirmation && o.situation.kind === "car");
  return opt?.situation.kind === "car" ? opt.situation.carId : undefined;
}

function buildScenarios(config: Config): Scenario[] {
  const vouCar = ambiguousVouCar(config);
  const a7 = config.challenge;
  return [
    ...config.employees.employees.map((e) => {
      const alt = e.alternative.kind === "car" ? carName(config, e.alternative.carId) : "ויתור על הרכב";
      return profileScenario({ id: e.id, label: `${e.name}: ${alt}`, text: openingMessage(config, e) }, e.profile, e.alternative);
    }),
    profileScenario({ id: "a7", label: "A7: תסריט האתגר", text: challengeOpeningMessage(config) }, a7.profile, a7.alternative),
    {
      id: "ask-rep",
      label: "לבקש אישור השתתפות מצוות הרכב",
      text: ASK_REP_MESSAGE,
      calls: (prompt) => {
        const carId = unconfirmedCar(prompt);
        if (!carId) return [];
        const question = `מה ההשתתפות העצמית ב-${carName(config, carId)}?`;
        return [{ toolName: "askRepresentative", input: { question, field: "participation", carId } }];
      },
      reply: (results, prompt) => {
        if (!results.askRepresentative) return "אין כרגע השתתפות שממתינה לאישור. אפשר לבקש השוואה לרכב מסוים קודם.";
        const carId = unconfirmedCar(prompt);
        return `שלחתי לצוות הרכב שאלה על ההשתתפות העצמית ב-${carId ? carName(config, carId) : "רכב החדש"}. ההשוואה תתעדכן כשתגיע תשובה.`;
      },
    },
    {
      id: "find-ev",
      label: "חיפוש לפי תנאים: חשמלי",
      text: FIND_EV_MESSAGE,
      calls: [{ toolName: "findOptions", input: { drives: ["electric"], maxNetDrop: 100 } }],
      reply: (r) => findReply(r.findOptions as z.output<typeof FindOptionsOutput> | undefined),
    },
    {
      id: "missing",
      label: "פרטים חסרים",
      text: missingDataMessage(config),
      calls: [{ toolName: "updateProfile", input: { source: "employee", profile: { group: config.employees.employees[0].profile.group } } }],
      reply: () => "רשמתי את קבוצת הזכאות. כדי לחשב חסרים לי עוד כמה פרטים: מה שכר הבסיס שלך, ואיזה רכב יש לך היום?",
    },
    {
      id: "rep",
      label: "השתתפות לא ידועה",
      text: UNKNOWN_PARTICIPATION_MESSAGE,
      calls: [
        {
          toolName: "askRepresentative",
          input: { question: "מה הרכב הנוכחי בפנייה ומה ההשתתפות העצמית בו?", field: "current", context: { reason: "employee_does_not_know" } },
        },
      ],
      reply: () => "שלחתי את השאלה לצוות הרכב. ההשוואה תתעדכן כשתגיע תשובה.",
    },
    {
      id: "no-data",
      label: "שאלה שאין עליה מידע",
      text: NO_DATA_MESSAGE,
      calls: [{ toolName: "logInformationGap", input: { topic: "rules", description: "כיסוי ביטוחי לרכב צמוד בזמן חופשת לידה" } }],
      reply: () => "אין לי מידע על כך בכללי החברה. רשמתי את השאלה כפער מידע כדי שהחברה תשלים אותה, ואפשר גם לשאול את צוות הרכב.",
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
        return "לא מצאתי את הרכב בטבלת שווי השימוש. אעביר את השאלה לצוות הרכב.";
      },
    },
  ];
}

export function demoPrompts(config: Config): DemoPrompt[] {
  return buildScenarios(config).map(({ id, label, text }) => ({ id, label, text }));
}

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** The last user message's text, and the tool results that came after it (this turn). */
function readTurn(prompt: Prompt) {
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
  return { text, results, count, before: prompt.slice(0, lastUser + 1) };
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
      const { text, results, count, before } = readTurn(prompt);
      const scenario = scenarios.find((s) => s.text === text);
      // Dynamic calls look only at the conversation before this turn, so they stay the same across steps.
      const calls = scenario ? (typeof scenario.calls === "function" ? scenario.calls(before) : scenario.calls) : [];
      const next = calls[count];
      if (next) {
        return {
          content: [{ type: "tool-call", toolCallId: `mock-${++callId}`, toolName: next.toolName, input: JSON.stringify(next.input) }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        };
      }
      const reply = scenario ? scenario.reply(results, before) : FALLBACK_REPLY;
      return { content: [{ type: "text", text: reply }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });
}
