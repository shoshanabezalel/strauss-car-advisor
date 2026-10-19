import { wrapLanguageModel, type LanguageModel } from "ai";
import { isTransient, ModelBusyError, suggestedDelayMs } from "./model-errors";

/** The v4 model interface (both providers implement it), without importing @ai-sdk/provider directly. */
type ModelInstance = Extract<Parameters<typeof wrapLanguageModel>[0]["model"], { specificationVersion: "v4" }>;

export interface FallbackOptions {
  /** Wait before the primary's one retry, unless the provider asks for a (shorter) delay. */
  retryDelayMs?: number;
  /** Cap on the provider's suggested wait: a chat turn can't sit out a long Retry-After. */
  maxWaitMs?: number;
  /** Called once, when the turn switches to the fallback model (the UI shows it). */
  onFallback?: () => void;
  sleep?: (ms: number) => Promise<void>;
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The production model (TECH-DESIGN §7): on 429 / 503, one retry of the primary; then the fallback model gets the
 * same call (same prompt, tools and settings: runAgentTurn and the number-guard don't know which model answered);
 * if that is busy too, ModelBusyError. Other errors pass through untouched.
 *
 * Create one per chat turn: once switched, the rest of the turn (tool steps, the guard's regeneration) stays on the
 * fallback, so a turn never alternates between providers.
 */
export function withFallback(primary: LanguageModel, fallback: LanguageModel | undefined, opts: FallbackOptions = {}): LanguageModel {
  const { retryDelayMs = 1_000, maxWaitMs = 3_000, onFallback, sleep = sleepMs } = opts;
  const backup = fallback === undefined ? undefined : instance(fallback);
  let switched = false;

  return wrapLanguageModel({
    model: instance(primary),
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ doGenerate, params }) => {
        const viaBackup = async (b: ModelInstance) => {
          try {
            return await b.doGenerate(params);
          } catch (err) {
            throw isTransient(err) ? new ModelBusyError(err) : err;
          }
        };
        if (switched && backup) return viaBackup(backup);

        let last: unknown;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            return await doGenerate();
          } catch (err) {
            if (!isTransient(err)) throw err;
            last = err;
            if (attempt === 1) await sleep(Math.min(suggestedDelayMs(err) ?? retryDelayMs, maxWaitMs));
          }
        }
        if (!backup) throw new ModelBusyError(last);
        switched = true;
        console.warn("[agent] primary model busy, switching to the fallback model:", (last as Error)?.message ?? last);
        onFallback?.();
        return viaBackup(backup);
      },
    },
  });
}

function instance(model: LanguageModel): ModelInstance {
  if (typeof model === "string") throw new Error("pass a model instance, not an id");
  return model as ModelInstance;
}
