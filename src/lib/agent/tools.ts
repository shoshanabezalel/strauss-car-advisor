import { tool, type ToolSet } from "ai";
import type { z } from "zod";
import type { Config, Situation } from "@/lib/config";
import { allowedCars, checkEligibility, compareOptions, missingProfileFields, type EmployeeProfile, type OptionResult } from "@/lib/engine";
import { displayDiff, roundShekel } from "@/lib/format/money";
import { getValueOfUse, searchValueOfUse, type VouSource } from "@/lib/vou";
import type { AgentEventSink } from "./events";
import * as S from "./schemas";
import type { AgentState, RepQueue } from "./state";

export interface AgentDeps {
  config: Config;
  vouSource: VouSource;
  state: AgentState;
  repQueue: RepQueue;
}

export const TOOL_NAMES = [
  "getCatalog",
  "checkEligibility",
  "getValueOfUse",
  "searchValueOfUse",
  "updateProfile",
  "compareOptions",
  "askRepresentative",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

type Handler<I extends z.ZodType, O extends z.ZodType> = (input: z.input<I>) => Promise<z.output<O>>;

export interface ToolHandlers {
  getCatalog: Handler<typeof S.GetCatalogInput, typeof S.GetCatalogOutput>;
  checkEligibility: Handler<typeof S.CheckEligibilityInput, typeof S.CheckEligibilityOutput>;
  getValueOfUse: Handler<typeof S.GetValueOfUseInput, typeof S.GetValueOfUseOutput>;
  searchValueOfUse: Handler<typeof S.SearchValueOfUseInput, typeof S.SearchValueOfUseOutput>;
  updateProfile: Handler<typeof S.UpdateProfileInput, typeof S.UpdateProfileOutput>;
  compareOptions: Handler<typeof S.CompareOptionsInput, typeof S.CompareOptionsOutput>;
  askRepresentative: Handler<typeof S.AskRepresentativeInput, typeof S.AskRepresentativeOutput>;
}

/**
 * Who is calling the tools. `agent` = the LLM: it may not claim a representative's confirmation (source "rep",
 * or any participationSource). `rep` = the representative-answer service (src/lib/chat/rep-answer.ts).
 */
export type ToolOrigin = "agent" | "rep";

export class ToolInputError extends Error {}

const PERCENT_FIELDS = new Set<S.ProfileField>(["pensionPct", "studyFundPct"]);

/** The table's amounts, rounded for display only (the engine's values stay unrounded beside them). */
function amounts(r: OptionResult) {
  return {
    valueOfUse: roundShekel(r.valueOfUse),
    participation: roundShekel(r.participation),
    carCost: roundShekel(r.carCost),
    budget: r.budget === undefined ? undefined : roundShekel(r.budget),
    electricGross: roundShekel(r.electricGross),
    maintenance: roundShekel(r.maintenance),
    familyGapEmployee: roundShekel(r.familyGapEmployee),
  };
}

/** Plain handlers: Zod-parse the input, call the engine / lookup, Zod-parse the output. No calculation here. */
export function createToolHandlers(deps: AgentDeps, { origin = "agent" }: { origin?: ToolOrigin } = {}): ToolHandlers {
  const { config, vouSource, state, repQueue } = deps;
  const { rules } = config;

  /** A car option without participation takes the representative's confirmed value, else the engine's catalog default. */
  const withParticipation = (s: Situation): Situation => {
    if (s.kind !== "car" || s.participation !== undefined) return s;
    const confirmed = state.repParticipation?.[s.carId];
    return confirmed === undefined ? s : { ...s, participation: confirmed, participationSource: "rep" };
  };

  return {
    async getCatalog(input) {
      const { scope = "allowed" } = S.GetCatalogInput.parse(input);
      if (scope === "all") return S.GetCatalogOutput.parse({ cars: config.catalog.cars, missing: [] });
      return S.GetCatalogOutput.parse(allowedCars(state.profile, config));
    },

    async checkEligibility(input) {
      const { option } = S.CheckEligibilityInput.parse(input);
      return S.CheckEligibilityOutput.parse(checkEligibility(state.profile, option, config));
    },

    async getValueOfUse(input) {
      const res = await getValueOfUse(S.GetValueOfUseInput.parse(input), vouSource, rules);
      return S.GetValueOfUseOutput.parse(res.status === "found" ? { ...res, mustConfirm: res.matchedBy === "partial" } : res);
    },

    async searchValueOfUse(input) {
      return S.SearchValueOfUseOutput.parse(await searchValueOfUse(S.SearchValueOfUseInput.parse(input), vouSource, rules));
    },

    async updateProfile(input) {
      const { updates } = S.UpdateProfileInput.parse(input);
      if (origin === "agent" && updates.some((u) => u.source === "rep")) {
        throw new ToolInputError('source "rep" is reserved for representative answers');
      }
      if (origin === "agent" && updates.some((u) => u.field === "current" && u.value.kind === "car" && u.value.participationSource !== undefined)) {
        throw new ToolInputError("participationSource is set by the tool, not by the caller");
      }

      const errors: { field: S.ProfileField; error: "unknown_group" | "unknown_occupation" | "unknown_car"; options?: string[] }[] = [];
      for (const u of updates) {
        if (u.field === "group" && !rules.groupOrder.includes(u.value)) {
          errors.push({ field: u.field, error: "unknown_group", options: rules.groupOrder });
        }
        if (u.field === "occupation" && !config.occupations.occupations.some((o) => o.name === u.value)) {
          errors.push({ field: u.field, error: "unknown_occupation", options: config.occupations.occupations.map((o) => o.name) });
        }
        if (u.field === "current") {
          const s = u.value;
          if (s.kind === "car" && !config.catalog.cars.some((c) => c.id === s.carId)) {
            errors.push({ field: u.field, error: "unknown_car" });
          }
        }
      }
      if (errors.length) return S.UpdateProfileOutput.parse({ ok: false, errors });

      // All-or-nothing: build a new profile, then swap it in.
      const profile: Record<string, unknown> = { ...state.profile };
      const sources = { ...state.sources };
      for (const u of updates) {
        let value: unknown = u.value;
        if (PERCENT_FIELDS.has(u.field)) value = (u.value as number) / 100; // unit conversion, so the LLM never converts
        if (u.field === "current" && u.value.kind === "car" && u.value.participation !== undefined && !u.value.participationSource) {
          value = { ...u.value, participationSource: u.source === "rep" ? "rep" : "employee" };
        }
        profile[u.field] = value;
        sources[u.field] = u.source;
      }
      state.profile = profile as EmployeeProfile;
      state.sources = sources;
      return S.UpdateProfileOutput.parse({
        ok: true,
        profile: state.profile,
        sources,
        missing: missingProfileFields(state.profile, config),
      });
    },

    async compareOptions(input) {
      const parsed = S.CompareOptionsInput.parse(input);
      if (origin === "agent" && parsed.options.some((o) => o.kind === "car" && o.participationSource !== undefined)) {
        throw new ToolInputError("participationSource is set by the tool, not by the caller");
      }
      const options = parsed.options.map(withParticipation);
      const { today, options: results } = compareOptions(state.profile, options, config);
      const todayNet = today.breakdown?.net;
      const net = (r: OptionResult) => (r.breakdown ? roundShekel(r.breakdown.net) : undefined);
      return S.CompareOptionsOutput.parse({
        today: { ...today, display: { ...amounts(today), net: net(today) } },
        options: results.map((r) => {
          const diff = r.breakdown && todayNet !== undefined ? displayDiff(r.breakdown.net, todayNet) : undefined;
          const direction = diff === undefined ? undefined : diff > 0 ? "up" : diff < 0 ? "down" : "none";
          return { ...r, display: { ...amounts(r), net: net(r), diffVsToday: diff, direction } };
        }),
      });
    },

    async askRepresentative(input) {
      const q = S.AskRepresentativeInput.parse(input);
      if (q.carId !== undefined && !config.catalog.cars.some((c) => c.id === q.carId)) {
        throw new ToolInputError(`unknown car ${q.carId}: use an id from getCatalog`);
      }
      return S.AskRepresentativeOutput.parse(await repQueue.ask(q));
    },
  };
}

// Sent to the model on every turn: short, and no digits (the number-guard allows only tool-output numbers).
const DESCRIPTIONS: Record<ToolName, string> = {
  getCatalog:
    'scope "all": every catalog car, to map car names to ids. Default scope: cars the employee may choose (saved profile).',
  checkEligibility: "Whether the employee may take this option (car or waiver), with the reason in Hebrew.",
  getValueOfUse: "Tax-authority value-of-use by make and model codes. Partial keys may return mustConfirm or ambiguous.",
  searchValueOfUse: "Find value-of-use candidates by car name. Never returns a single picked value.",
  updateProfile: "Save data the employee stated. Percent fields as the employee said them (six for six percent). Returns missing fields.",
  compareOptions:
    "Net today vs each requested option. Quote numbers only from display. Omit participation for a new car: the tool applies the representative's answer or the catalog default.",
  askRepresentative:
    'Send a question to the car representative for company data the employee cannot know. field "participation" needs the carId; "current" for an unknown current car or one not in the catalog.',
};

/** Model-facing input schemas: no rep-only fields, flat updateProfile (schemas.ts, "model-facing inputs"). */
const INPUTS: Record<ToolName, z.ZodType> = {
  getCatalog: S.GetCatalogInput,
  checkEligibility: S.AgentCheckEligibilityInput,
  getValueOfUse: S.GetValueOfUseInput,
  searchValueOfUse: S.SearchValueOfUseInput,
  updateProfile: S.AgentUpdateProfileInput,
  compareOptions: S.AgentCompareOptionsInput,
  askRepresentative: S.AskRepresentativeInput,
};

/** The same handlers as AI SDK tools. `onEvent` reports each call's progress (never its output). */
export function createTools(deps: AgentDeps, onEvent?: AgentEventSink): ToolSet {
  const handlers = createToolHandlers(deps);
  return Object.fromEntries(
    TOOL_NAMES.map((name) => [
      name,
      tool({
        description: DESCRIPTIONS[name],
        inputSchema: INPUTS[name],
        execute: async (input: unknown) => {
          onEvent?.({ type: "tool", name, state: "running" });
          try {
            const handlerInput = name === "updateProfile" ? S.toProfileUpdates(input as z.output<typeof S.AgentUpdateProfileInput>) : input;
            const output = await (handlers[name] as (i: unknown) => Promise<unknown>)(handlerInput);
            onEvent?.({ type: "tool", name, state: "done" });
            return output;
          } catch (err) {
            onEvent?.({ type: "tool", name, state: "error" });
            throw err;
          }
        },
      }),
    ]),
  );
}
