import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { ModelBusyError } from "@/lib/agent/model-errors";
import { checkNumbers } from "@/lib/agent/number-guard";
import { analysisInput, type GapSummary } from "./summary";

/**
 * "ניתוח AI" on the rep screen's gaps tab (G add-on). The model reads ONLY the code-computed summary (counts and
 * topic keys: no rows, conversation ids or descriptions) and writes three to five short Hebrew insights, each with a
 * recommended action and the count it is based on. It may not compute: every number it writes, and basedOnCount,
 * must appear in the summary (the agent's number-guard, with the summary as the only source). One regeneration,
 * then a fixed message. Too little data → a fixed message, and the model is not called.
 */
export const MIN_GAPS_FOR_ANALYSIS = 5;
export const INSUFFICIENT_DATA_MESSAGE = "עדיין אין מספיק פערי מידע כדי לזהות מגמות. כדאי לחזור לניתוח אחרי שיצטברו עוד פניות.";
const FAILED_MESSAGE = "לא הצלחתי להפיק ניתוח מדויק מהנתונים הפעם. אפשר לנסות שוב, או לעבור על הרשימה למטה.";
const BUSY_MESSAGE = "המערכת עמוסה כרגע. אפשר לנסות את הניתוח שוב בעוד דקה.";
const MAX_ATTEMPTS = 2;

const InsightSchema = z.object({
  insight: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(200),
  basedOnCount: z.number().int().nonnegative(),
});
const AnalysisSchema = z.object({ insights: z.array(InsightSchema).min(3).max(5) });
export type GapInsight = z.infer<typeof InsightSchema>;

export type GapAnalysis =
  | { status: "ok"; insights: GapInsight[] }
  | { status: "insufficient" | "failed" | "busy"; message: string };

// No digits in the instructions, like the agent's prompt: every number in the answer must come from the summary.
const SYSTEM = [
  "You analyse an information-gaps summary for a company car advisor used by Strauss employees.",
  "Gap types: no_data (the assistant had no information), referred_to_rep (a company value had to go to the car representative), unknown_vehicle (a car that is not in the catalog).",
  "Write between three and five short insights in Hebrew. Each has: insight (what the data shows), action (one concrete step for the company, e.g. add a car to the catalog, confirm a participation, add a rule), basedOnCount (the exact count from the summary the insight rests on).",
  "Use only numbers that appear in the summary, exactly as written. Never compute, add, subtract, compare as a percentage or estimate a number. If a comparison needs a number that is not given, describe it in words.",
  "windowDays is the length of each week compared (thisWeek vs lastWeek). Each top topic has a Hebrew label naming what is missing; refer to cars by the make and model in the label.",
  "The data holds no people and no personal details; do not mention any.",
].join("\n");

const hebrew = /[א-ת]/;
/** A catalog id (CAR-10) never reaches the reader: the model gets car names, and must not invent ids. */
const catalogId = /CAR-\d+/i;

/** Every number in the texts and every basedOnCount must come from the summary. */
function check(a: z.infer<typeof AnalysisSchema>, input: ReturnType<typeof analysisInput>): boolean {
  const sources = { toolOutputs: [input] };
  return a.insights.every(
    (i) =>
      hebrew.test(i.insight) &&
      hebrew.test(i.action) &&
      !catalogId.test(`${i.insight} ${i.action}`) &&
      checkNumbers(`${i.insight}\n${i.action}`, sources).ok &&
      checkNumbers(String(i.basedOnCount), sources).ok,
  );
}

export async function analyzeGaps(summary: GapSummary, model: LanguageModel, { abortSignal }: { abortSignal?: AbortSignal } = {}): Promise<GapAnalysis> {
  if (summary.total < MIN_GAPS_FOR_ANALYSIS) return { status: "insufficient", message: INSUFFICIENT_DATA_MESSAGE };

  const input = analysisInput(summary);
  let note = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { output } = await generateText({
        model,
        system: SYSTEM + note,
        prompt: `Summary JSON:\n${JSON.stringify(input)}`,
        output: Output.object({ schema: AnalysisSchema }),
        maxRetries: 0,
        abortSignal,
      });
      if (output && check(output, input)) return { status: "ok", insights: output.insights };
    } catch (err) {
      if (err instanceof ModelBusyError || (err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError") {
        return { status: "busy", message: BUSY_MESSAGE };
      }
      // A reply that doesn't match the schema counts as a failed attempt.
    }
    note = "\nYour previous answer was rejected: it used a number that is not in the summary, a catalog id, broke the format, or was not in Hebrew. Use only the summary's numbers, three to five insights.";
  }
  return { status: "failed", message: FAILED_MESSAGE };
}
