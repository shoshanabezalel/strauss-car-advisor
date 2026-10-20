import { APICallError, generateText, type LanguageModel } from "ai";

export type ModelCheck = { ok: true; ms: number } | { ok: false; ms: number; error: string; status?: number };

/**
 * One real call to a model, to prove it answers (POST /api/health/fallback; M7). A model listed by the provider can
 * still be unavailable (gemini-2.5-flash returned 404 on 20/10), and a broken fallback would only show itself when the
 * primary is already busy. No retries: the first failure is the answer. No user data, no numbers.
 */
export async function checkModelAnswers(model: LanguageModel, timeoutMs = 20_000): Promise<ModelCheck> {
  const start = Date.now();
  try {
    const { text } = await generateText({
      model,
      prompt: "Health check. Reply with the single word: ok",
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - start;
    return text.trim() ? { ok: true, ms } : { ok: false, ms, error: "empty reply" };
  } catch (err) {
    const status = APICallError.isInstance(err) ? err.statusCode : undefined;
    return { ok: false, ms: Date.now() - start, error: (err as Error)?.message ?? String(err), ...(status ? { status } : {}) };
  }
}
