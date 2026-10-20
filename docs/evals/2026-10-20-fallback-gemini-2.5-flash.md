# Live eval runs: 20/10/2026 (fallback model gemini-2.5-flash)

`EVAL_TARGET=fallback FALLBACK_MODEL=gemini-2.5-flash npx vitest run --config vitest.evals.config.mts --silent=false`,
current prompt (recompare line reverted), same Google key. Two runs: **0/9 both times**, every case in under 1.5 s.

The model never answered. Every call returned **404**: *"This model models/gemini-2.5-flash is no longer available to
new users. Please update your code to use models/gemini-3.8-flash …"*, although the key's model list (Google models
API, 20/10) still lists `gemini-2.5-flash` with `generateContent`. The chat reported it as `failed` (a 404 is not a
transient error, so no retry and no busy message), as designed.

| Fallback model | Runs (current prompt) | Result |
|---|---|---|
| gemini-3.5-flash-lite | 3 (20/10) | 7/9 each: E-005 split save, A7 blocked by the guard |
| gemini-2.5-flash | 2 (20/10) | 0/9: model unavailable (404) |

Conclusion: no quality comparison was possible; `gemini-3.5-flash-lite` stays the documented `FALLBACK_MODEL`.
Being listed by the models API does not mean a model can be called: check a fallback with a live call before
relying on it.

## Log: run 1 (run 2 identical)

```text

 RUN  v5.0.5 C:/Projects/hackathon/strauss

stderr | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > A7: after the rep confirmed the participation, the live model continues without asking again
[chat] turn failed APICallError [AI_APICallError]: This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).
    at file:///C:/Projects/hackathon/strauss/node_modules/@ai-sdk/provider-utils/dist/index.js:3844:11
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async postToApi (file:///C:/Projects/hackathon/strauss/node_modules/@ai-sdk/provider-utils/dist/index.js:3552:24)
    at async postJsonToApi (file:///C:/Projects/hackathon/strauss/node_modules/@ai-sdk/provider-utils/dist/index.js:3513:127)
    at async GoogleLanguageModel.doGenerate (file:///C:/Projects/hackathon/strauss/node_modules/@ai-sdk/google/dist/index.js:1837:69)
    at async doGenerate (file:///C:/Projects/hackathon/strauss/node_modules/ai/dist/index.js:16015:35)
    at withRateLimitRetry (C:/Projects/hackathon/strauss/tests/evals/rate-limit.ts:19:14)
    at async Object.doGenerate (file:///C:/Projects/hackathon/strauss/node_modules/ai/dist/index.js:16017:26)
    at async execute (file:///C:/Projects/hackathon/strauss/node_modules/ai/dist/index.js:5650:31)
    at async runWithTracingChannelSpan (file:///C:/Projects/hackathon/strauss/node_modules/ai/dist/index.js:4394:80) {
  cause: undefined,
  url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  requestBodyValues: {
    generationConfig: {
      maxOutputTokens: undefined,
      temperature: undefined,
      topK: undefined,
      topP: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
      stopSequences: undefined,
      seed: undefined,
      responseMimeType: undefined,
      responseJsonSchema: undefined,
      responseModalities: undefined,
      thinkingConfig: undefined
    },
    contents: [
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object]
    ],
    systemInstruction: { parts: [Array] },
    safetySettings: undefined,
    tools: [ [Object] ],
    toolConfig: { functionCallingConfig: [Object] },
    cachedContent: undefined,
    labels: undefined,
    serviceTier: undefined
  },
  statusCode: 404,
  responseHeaders: {
    'alt-svc': 'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000',
    'content-encoding': 'gzip',
    'content-type': 'application/json; charset=UTF-8',
    date: 'Tue, 20 Oct 2026 18:21:36 GMT',
    server: 'scaffolding on HTTPServer2',
    'server-timing': 'gfet4t7; dur=194',
    'transfer-encoding': 'chunked',
    vary: 'Origin, X-Origin, Referer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'x-xss-protection': '0'
  },
  responseBody: '{\n' +
    '  "error": {\n' +
    '    "code": 404,\n' +
    '    "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).",\n' +
    '    "status": "NOT_FOUND"\n' +
    '  }\n' +
    '}\n',
  isRetryable: false,
  data: {
    error: {
      code: 404,
      message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).',
      status: 'NOT_FOUND'
    }
  },
  [Symbol(vercel.ai.error)]: true,
  [Symbol(vercel.ai.error.AI_APICallError)]: true
}

 ❯ tests/evals/agent.eval.ts (9 tests | 9 failed) 3733ms
   ❯ agent evals (live model: fallback gemini-2.5-flash) (9)
     × E-001: reaches the sheet's net via chat, with no invented numbers 1321ms
     × E-002: reaches the sheet's net via chat, with no invented numbers 250ms
     × E-003: reaches the sheet's net via chat, with no invented numbers 289ms
     × E-004: reaches the sheet's net via chat, with no invented numbers 279ms
     × E-005: reaches the sheet's net via chat, with no invented numbers 283ms
     × E-006: reaches the sheet's net via chat, with no invented numbers 301ms
     × A12: unknown participation for a new car → flagged or sent to the representative, no invented number 291ms
     × A7: after the rep confirmed the participation, the live model continues without asking again 503ms
     × A12: a car outside the catalog → lookup or representative, never a made-up comparison 212ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > E-001: reaches the sheet's net via chat, with no invented numbers
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > E-002: reaches the sheet's net via chat, with no invented numbers
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > E-003: reaches the sheet's net via chat, with no invented numbers
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > E-004: reaches the sheet's net via chat, with no invented numbers
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > E-005: reaches the sheet's net via chat, with no invented numbers
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > E-006: reaches the sheet's net via chat, with no invented numbers
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > A12: unknown participation for a new car → flagged or sent to the representative, no invented number
 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > A12: a car outside the catalog → lookup or representative, never a made-up comparison
AI_APICallError: This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).
 ❯ node_modules/@ai-sdk/provider-utils/src/response-handler.ts:151:16
 ❯ postToApi node_modules/@ai-sdk/provider-utils/src/post-to-api.ts:118:28
 ❯ postJsonToApi node_modules/@ai-sdk/provider-utils/src/post-to-api.ts:31:3
 ❯ GoogleLanguageModel.doGenerate node_modules/@ai-sdk/google/src/google-language-model.ts:773:9
 ❯ doGenerate node_modules/ai/src/middleware/wrap-language-model.ts:85:38
 ❯ withRateLimitRetry tests/evals/rate-limit.ts:19:14
     17|   for (let attempt = 1; ; attempt++) {
     18|     try {
     19|       return await fn();
       |              ^
     20|     } catch (err) {
     21|       if (isUnavailable(err)) {
 ❯ Object.doGenerate node_modules/ai/src/middleware/wrap-language-model.ts:88:11
 ❯ execute node_modules/ai/src/generate-text/generate-text.ts:1061:23
 ❯ runWithTracingChannelSpan node_modules/ai/src/telemetry/tracing-channel-publisher.ts:76:12

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/9]⎯

 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-2.5-flash) > A7: after the rep confirmed the participation, the live model continues without asking again
AssertionError: {"type":"error","error":"failed","message":"משהו השתבש ולא הצלחתי לענות. אפשר לנסות שוב בעוד רגע."}: expected { Object (type, error, ...) } to be undefined

- Expected:
undefined

+ Received:
{
  "error": "failed",
  "message": "משהו השתבש ולא הצלחתי לענות. אפשר לנסות שוב בעוד רגע.",
  "type": "error",
}

 ❯ tests/evals/agent.eval.ts:152:42
    150|     const events = await send(`תודה! אז מה הנטו שלי עכשיו עם ה-${carNa…
    151|     const error = events.find((e) => e.type === "error");
    152|     expect(error, JSON.stringify(error)).toBeUndefined();
       |                                          ^
    153|     const result = resultOf(events)!;
    154|     const tools = events.flatMap((e) => (e.type === "tool" && e.state …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/9]⎯


 Test Files  1 failed (1)
      Tests  9 failed (9)
   Start at  21:21:32
   Duration  5.77s (tests 84%, import 10%, transform 6%)

```
