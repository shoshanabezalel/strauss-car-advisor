# TECH DESIGN

## 1. Folder structure
```
data/
  strauss-rules.json          # source: sample rules file
  catalog.json                # from Excel sheet "קטלוג רכבים" (+ vehicleTypeCode = "1")
  occupations.json            # from sheet "עיסוקים"
  sample-employees.json       # "עובדים לדוגמה" + expected values from "חישובים"
  challenge-script.json       # A7: the brief's script (+ demo values for what it leaves open, see `assumed`)
  raw/                        # original files (xlsx, csv, pdf)
scripts/
  xlsx-to-json.ts             # converts the Excel to JSON (one-off)
  import-vou.ts               # CSV (cp1255) → value_of_use table
src/lib/config/   rules.ts, catalog.ts, occupations.ts   (load + Zod)
src/lib/engine/   net.ts, eligibility.ts, compare.ts, types.ts
src/lib/vou/      parse.ts, lookup.ts, memory-source.ts, supabase-source.ts
src/lib/agent/    schemas.ts, state.ts, tools.ts, system-prompt.md (+ .ts loader), number-guard.ts,
                  notices.ts, run-turn.ts, events.ts, model.ts, mock-model.ts, demo-messages.ts, replies.ts, explain.ts,
                  model-errors.ts, fallback-model.ts (M7)
src/lib/chat/     handle-turn.ts, store.ts (+ memory-store, supabase-store), comparison-view.ts, history.ts, ndjson.ts,
                  rep-answer.ts, rep-view.ts, conversation-response.ts, direct-turn.ts, direct-actions.ts, profile-view.ts
src/lib/realtime/ topics.ts, conversation-topic.ts, notifier.ts, supabase-notifier.ts, ping-fallback.ts, use-ping.ts
src/lib/security/ owner.ts, rep-session.ts, rate-limit.ts, http.ts (M7)
src/lib/format/   money.ts, labels.ts (Hebrew field labels shared by UI and replies)
src/app/employee/ (+ profile-panel, option-picker) , src/app/rep/ , src/app/api/{chat,conversation,profile,compare}/ ,
                  src/app/api/rep/{questions,answer,login,logout}/
tests/unit/ , tests/e2e/ (+ *.deployed.spec.ts for the public URL) , tests/evals/ (live LLM, `npm run eval:agent`, not in `npm test`)
.github/workflows/ ci.yml (push / PR), eval-agent.yml (manual)
```

## 2. Data model (TypeScript)
```ts
type Group = 'א'|'ב'|'ג'|'ד';          // Hebrew values kept as in the source data
type Drive = 'petrol'|'hybrid'|'plugin'|'electric';

interface Car { id: string; group: Group|'משפחתי'; make: string; makeCode: string;
  model: string; modelCode: string; vehicleTypeCode: string; regYear: number;
  drive: Drive; listPrice: number; valueOfUse: number; monthlyCost: number;
  defaultParticipation: number; }

interface Occupation { name: string; group: Group; carMandatory: boolean;
  waiverAllowed: boolean; maintenance: number; }

interface EmployeeProfile {   // each field: value + source ('employee'|'rep'|'payslip'|'catalog_default')
  occupation?: string; group?: Group; baseSalary?: number; commissions?: number; bonus?: number;
  pensionPct?: number; studyFundPct?: number; creditPoints?: number; childrenUnder23?: number;
  current?: Situation; }

type Situation =
  | { kind: 'car'; carId: string; participation?: number;    // omitted → catalog defaultParticipation
      participationSource?: 'employee'|'rep'|'catalog_default' }
  | { kind: 'waiver' };       // maintenance derived from occupation

interface OptionResult {
  situation: Situation; eligibility: { eligible; track: 'regular'|'family'|'waiver'; reason /* Hebrew */; missing[] };
  car?: Car; budget?: number; carCost: number; familyGapEmployee: number;
  participation: number; participationSource?: ParticipationSource;
  needsConfirmation: boolean;                                // participation is an unconfirmed catalog default
  valueOfUse: number; maintenance: number; electricGross: number;
  breakdown?: NetBreakdown;   // cash, pension, studyFund, taxable, tax, NI, health, net — unrounded;
                              // absent when data is missing or the option is not eligible
  diffVsToday?: number; changes: Change[];                   // structured facts for the explanation
  missing: MissingField[];                                   // non-empty → no net
}
```
Implementation: `src/lib/engine/` (types, net, eligibility, compare). The engine takes config as an argument and does no I/O.

## 3. Net algorithm (verified against all 6 reference employees — all match)
```
cash        = base + commissions + bonus
pension     = cash × pensionPct          // on full gross (not on maintenance / value-of-use)
studyFund   = cash × studyFundPct
taxable     = cash + valueOfUse + maintenance + electricGross
taxBrackets = Σ brackets(taxable)        // netMethod.brackets
pensionCred = 0.35 × min(pension, 0.07 × 9,500)       // ≤ 232.75
tax         = max(0, taxBrackets − creditPoints × 242 − pensionCred)
NI, health  = two-tier on min(taxable, ceiling): low rate up to threshold, high rate above
familyGapEmployee = max(0, carCost − budget) × 0.5    // family track only
net = cash + maintenance + electricGross − tax − NI − health − pension − studyFund
      − participation − familyGapEmployee
```
**EV gross-up**: binary search on electricGross such that
`net(with G) − net(G=0) = 250` (no rounding). Reference results: 440 / 473 ILS (exact 439.91 / 473.22).
The method comes from `rules.electric.method`: `gross_up` (default) or `flat`, where G = netBonus as taxable gross.
**Rounding**: display only, whole shekel (`src/lib/format/money.ts`). The **shown diff = round(alt) − round(today)**,
the difference of the rounded values. This is what the sheet does: for E-003 (exact −1938.68) and E-006 (exact
721.70), rounding the exact diff would give −1939 / 722, but the sheet shows −1938 / 721. It also keeps the table
consistent (shown diff = shown alt − shown today). The engine's `diffVsToday` stays unrounded.

Reference for tests (net today → alternative, EV gross):
E-001 11,032→11,693 (440) · E-002 8,600→5,078 · E-003 15,047→13,109 (473) ·
E-004 10,693→11,900 (440) · E-005 14,244→17,806 · E-006 17,073→17,794 (473)

## 4. Eligibility (`checkEligibility`)
Check order; each returns a Hebrew `reason`:
1. Waiver: occupation `carMandatory` → no; `waiverAllowed=false` → no; else maintenance per occupation.
2. Family car: `childrenUnder23 ≥ 4` → eligible; gap per the car's catalog cost.
3. Regular car: `groupOrder.indexOf(car.group) ≤ indexOf(employee.group)`.
4. Unknown group / occupation / car, or unknown children for a family car → `missing`, never a guess.
   Group absent but occupation known → the occupation's group from occupations.json (that is data, not a guess).
- `allowedCars(profile)`: own group and lower, plus family cars when `childrenUnder23 ≥ minChildren`. Unknown children → no
  family cars + `missing: ['childrenUnder23']`; unknown group → `{ cars: [], missing: ['group'] }`.
- "Today" is evaluated without an eligibility gate; requested options get a net only when eligible.

## 5. Value-of-use
- Table `value_of_use(tax_year, reg_year, vehicle_type_code, make_code, model_code, ...)`, PK on all five.
  `model_name` = תאור דגם (model description), `trade_name` = כינוי מסחרי; unused columns go to `raw` jsonb.
- Import (`npm run import:vou`, `scripts/import-vou.ts`): decode cp1255 (built-in `TextDecoder`), trim, codes as strings,
  columns **by position** (19, checked), drive code → `Drive` per rules.valueOfUse.driveField (the CSV header is wrong).
  Upsert in chunks of 1000 on the PK, so it is idempotent. 77,988 rows for tax year 2026.
- Tax year comes from `rules.valueOfUse.taxYear`; callers may override it.
- Code: `src/lib/vou/` — `parse.ts` (pure), `lookup.ts` (pure logic over a `VouSource`), `memory-source.ts` (tests),
  `supabase-source.ts` (DB; name search filter built only by `buildNameFilter`, which LIKE-escapes `\ % _` and
  double-quotes values so `, ( ) "` in a query can't break PostgREST `or()`).
- `getValueOfUse({ makeCode, modelCode, regYear?, vehicleTypeCode?, taxYear? })` →
  - `{ status: 'found', value, record, matchedBy: 'key' }`: the full key matched;
  - `{ status: 'found', ..., matchedBy: 'partial' }`: part of the key was missing and exactly one row matched.
    **The agent (M3) must confirm a `partial` match with the user (show make/model/year) before using the value.**
  - `{ status: 'ambiguous', candidates, truncated }`: two or more rows (e.g. ATTO 3 / TANG without the vehicle type
    code) → ask, never pick;
  - `{ status: 'not_found' }`.
- `searchValueOfUse({ query, regYear?, makeCode?, limit? })`: case-insensitive substring of trade, make or model name →
  `{ status: 'candidates', candidates, truncated }` (max 20 by default) or `{ status: 'not_found' }`. Never a picked value.
- Tests: every catalog car (from catalog.json) → found with value, drive and list price equal to the catalog;
  ATTO 3/TANG collision; name search; filter escaping. `npm run check:db` repeats the catalog and collision checks
  against the DB with the publishable key.
- The engine still takes catalog cars' value from catalog.json (proven equal to the table).

## 6. Agent tools (Zod)
Code: `src/lib/agent/tools.ts`. `createToolHandlers(deps)` gives plain handlers: Zod-parse the input, call an existing
engine/lookup function, Zod-parse the output (`schemas.ts`). `createTools(deps)` wraps the same handlers as AI SDK tools.
`deps = { config, vouSource, state: { profile, sources }, repQueue }`. No calculation lives in the tools.

| Tool | Input | Wraps → output |
|---|---|---|
| `getCatalog` | `{ scope?: 'allowed' \| 'all' }` | `allowed` (default): `allowedCars` on the profile; `all`: whole catalog for name → id lookup → `{ cars, missing }` |
| `checkEligibility` | `{ option: Situation }` | `checkEligibility` → `{ eligible, track, reason, missing }` |
| `getValueOfUse` | `{ makeCode, modelCode, regYear?, vehicleTypeCode?, taxYear? }` | lookup result + `mustConfirm` (= `matchedBy: 'partial'`) |
| `searchValueOfUse` | `{ query, regYear?, makeCode? }` | `{ status: 'candidates', candidates } \| { status: 'not_found' }` |
| `updateProfile` | `{ updates: [{ field, value, source }] }` | `{ ok: true, profile, sources, missing }` or `{ ok: false, errors: [{ field, error, options? }] }` |
| `compareOptions` | `{ options: Situation[] }` (1–4) | engine `compareOptions` + `display` per row (`net`, `diffVsToday`, `direction`) |
| `askRepresentative` | `{ question, field: 'participation'\|'current'\|'group'\|'occupation', carId?, context? }` | `{ questionId, status: 'open' }` |

- `updateProfile` is all-or-nothing. It rejects an unknown group, occupation or car with the allowed options. Percent
  fields arrive as said (6 → the tool stores 0.06), so the LLM never converts. A stated current-car participation gets
  the update's source. `missing` comes from engine `missingProfileFields` (F2 fields).
- `display` uses `roundShekel` / `displayDiff` (§3), so the model quotes ready values and never subtracts. It also
  carries the table amounts (`valueOfUse`, `participation`, `carCost`, `budget`, `electricGross`, `maintenance`,
  `familyGapEmployee`) for today and each option, so the UI renders the table without arithmetic. `direction`
  (`up`/`down`/`none`) is the diff's sign as a word: replies say עלייה / ירידה with the absolute value, never a minus sign.
- Call budget per case: one `getCatalog` (`all`) to map names → ids, one `updateProfile` with every stated field, then `compareOptions`.
- Rule: if an output has `missing`, the model asks the employee or the representative.
- **Origin (M5)**: `createToolHandlers(deps, { origin })`. `agent` (the LLM, the default; `createTools` always uses it)
  may not send `source: "rep"` to updateProfile, nor any `participationSource` (in compareOptions options or in a
  `current` situation): the tool throws `ToolInputError`. Only the rep-answer service uses `origin: "rep"`, so a model
  can never fake a representative's confirmation.
- **Model-facing input schemas (M6, from the 19/10 live evals)**: `createTools` offers the model separate schemas
  (schemas.ts, "model-facing inputs"):
  - `AgentSituationSchema` has no `participationSource`; updateProfile's source is `employee` / `payslip` only.
    Zod strips unknown keys, so a spoofed `participationSource: "rep"` is dropped silently and the value is saved as
    the employee's (tested). The handler checks above stay as a second line.
  - updateProfile is **flat**: `{ source, profile: { occupation?, group?, baseSalary?, … , current? } }`, which
    `toProfileUpdates` turns into the handler's `updates` list. With the list form, Gemini guessed field names
    (`pensionRate`, `currentOption`, `eligibilityGroup`), got a validation error and called again.
  - In that flat schema, `occupation` and `group` are **enums built from the data** (`occupations.json` names,
    `rules.groupOrder`) by `agentUpdateProfileInput(lists)`. With free strings, Gemini dropped the gender form
    ("מפתח תוכנה" for "מפתח/ת תוכנה"). No fuzzy matching on the server: that would be guessing.
  - Turns report `toolErrors`, and the evals log every call's input and every rejected call.
- `AgentState.repParticipation` (car id → ₪): rep-confirmed participation for cars other than the current one.
  compareOptions fills a car option without participation from it (`participationSource: "rep"`, no
  `needsConfirmation`), so the confirmation survives later agent turns. Otherwise the engine uses the catalog default.
- askRepresentative is structured: `participation` requires a catalog `carId`; free-text fields are rejected. This is
  what lets an answer be applied as data (§7b).

## 7. System prompt and number-guard
- Prompt: `src/lib/agent/system-prompt.md`, in English. The bot always replies in Hebrew. Sections: hard rules (never compute,
  never guess, at most two questions), workflow, signals (`missing`, `ambiguous`, `mustConfirm`/`partial`, `needsConfirmation`,
  `ok:false`, after `askRepresentative`), after `compareOptions` (first line = new net + diff from `display`, then at most two
  lines from `changes`; the change is phrased עלייה / ירידה), a glossary of Hebrew terms, and two Hebrew example replies. **No digits** (a test enforces it), so the
  prompt can't leak numbers. Read from disk, traced into the build via `outputFileTracingIncludes`.
- Number-guard (`number-guard.ts`): every number in the final text must match a numeric leaf (or a number inside a string
  leaf) of a tool output from **this turn**, or of the validated `state.profile`. Accepted display forms: the value, whole
  shekel, 1–2 decimals, and ×100 for fractions (percent). Signs are ignored (Hebrew wording carries them). The guard never
  sums. Digits inside catalog and occupation names ("ATTO 3", "MG4") are stripped first.
- `runAgentTurn` (`run-turn.ts`): `generateText` with tools → guard → on violation, **one** regeneration with a note listing
  the offending numbers (this turn's tool round-trips are kept; the rejected text is dropped) → if it fails again, a fixed
  Hebrew `BLOCKED_REPLY` with no digits. The text is buffered, not streamed, so the guard sees it first.
- Notices (`notices.ts`): structured flags derived in code from the turn's tool outputs, for the UI regardless of wording:
  `missing`, `participation_unconfirmed`, `ambiguous_vou`, `confirm_vou_match`, `rep_question_open`.
- Model: `model.ts`, Gemini via `@ai-sdk/google`, id from `AGENT_MODEL` (default `gemini-3.5-flash`), wrapped with the
  Claude fallback since M7 (§7d).
- **Mock model** (`AGENT_MODEL=mock`, `mock-model.ts`): for local dev / e2e without LLM access. It matches the last
  user message to a scenario built from `data/sample-employees.json` (`demo-messages.ts`: E-001…E-006 opening messages,
  missing data, unknown participation → representative, ATTO 3 without type code → ambiguous), emits the scripted
  tool calls one step at a time, then a reply built from the tool results' `display` values. The real tools, engine and
  guard run unchanged. Unknown messages get a fixed reply without digits. Refused when `NODE_ENV=production`;
  `AGENT_MOCK_DELAY_MS` adds a delay per step. The live evals skip themselves in mock mode.
- **Events** (`events.ts`): `runAgentTurn({ onEvent })` emits `status` (`thinking` / `checking` / `regenerating`, and
  `fallback` from the chat route since M7) and `tool` (`running` / `done` / `error`) events. No event carries model text.

## 7a. Chat API and employee screen (M4)
- `POST /api/chat` `{ conversationId?: uuid, text }` → `application/x-ndjson` stream of `ChatEvent`
  (`src/lib/chat/handle-turn.ts`): `conversation` (id, first), then `status` / `tool` while the agent works, then one
  `result` `{ reply, blocked, notices, comparison? }` **after the guard**, or `error` (`not_found` / `failed` / `busy`,
  Hebrew message, no internals). `maxDuration = 120` since M7 (§7d). Header `x-agent-mode: mock|live`.
- `handleChatTurn`: load or create the conversation → `runAgentTurn` with the stored history + saved state → store the
  user message, the turn's tool round-trips and the final reply (with `meta: { notices, blocked }`), the state, the latest
  `compareOptions` output; a `rep_question_open` notice sets status `waiting_rep`. A failed turn stores nothing.
- `ConversationStore` (`store.ts`): Supabase (`supabase-store.ts`, service role) in the app, memory in unit tests.
  `messages.content = { message: ModelMessage, meta? }`; `profiles.data = { profile, sources }`; `askRepresentative`
  inserts into `rep_questions`.
- `GET /api/conversation?c=<uuid>` → visible history (user text + final replies with their notices), the last
  comparison view, status, and (M7) the Realtime `topic`. 400 for a non-UUID id, 404 if unknown **or not the
  caller's** (§7e).
- `toComparisonView` (`comparison-view.ts`): rows for today + each option with labels, eligibility and the `display`
  amounts copied as-is (a test checks every number is a `display` value).
- `/employee`: chat, progress chips from events, notices as alerts from `notices` (never parsed from text), comparison as
  a table from `md` up and one card per option below. Mock mode shows a badge and demo prompts. The conversation id
  goes into the URL (`?c=`), so a reload restores the screen.

## 7b. Representative screen, answers as data, Realtime (M5)
- **Answer** (`POST /api/rep/answer` → `answerRepQuestion`, `src/lib/chat/rep-answer.ts`), `RepAnswerSchema`, typed per
  field: `participation {carId, value}`, `current {situation}`, `group {value}`, `occupation {value}`. Steps:
  1. Load the question; a field or car mismatch → 400.
  2. Bound check: participation ≤ `maxParticipation(car, rules)` = min(`rules.participation.max`, the car's
     `monthlyCost`). Above it → 422 with a Hebrew message; the question stays open.
  3. **Claim**: a conditional update `open → answered` with the answer. If no row changed → 409, so an answer is
     applied once.
  4. Apply it through the **rep-origin tools**: the current car's participation or `current` → updateProfile (source
     rep); another car → `state.repParticipation`; group / occupation → updateProfile. `ok:false` → re-open, 422.
  5. Re-run compareOptions with the last comparison's options. Catalog-default and rep participations are stripped,
     so the tool fills them again.
  6. Reply: `repAnsweredReply` (`replies.ts`, shared with the mock model) quotes the answer and the tool's `display`
     values. The number-guard checks it against the outputs + the validated answer + the profile; on a violation a
     digit-free fallback is used. **No LLM call.**
  7. Store: state, comparison, a synthetic tool round-trip (`toolCallId rep-<qid>-n`, hidden from the chat, visible to
     later agent turns), and the reply with notices (`rep_answered` + derived ones). Status → `active` if no question
     is still open.
  8. Ping `conversation:<id>` and `rep-queue`. Any failure after the claim re-opens the question → 500.
- **Model history**: step 7 stores an assistant tool-call message right after the agent's reply. `@ai-sdk/google`
  (4.0.99, `convertToGoogleMessages`) turns each assistant message into its own `model` content, and each tool
  message into a `user` content with `functionResponse` parts; nothing is merged. `handleChatTurn` therefore builds the
  model history with `toModelHistory` (`history.ts`), which merges consecutive assistant messages, and consecutive tool
  messages, keeping every part in order. The stored history is unchanged. A unit test runs the real Google provider
  with a captured `fetch` and checks the request alternates user / model. Verified live on 19/10 (A7 eval).
- **thoughtSignature warning** (seen in the 19/10 live run): Gemini 3 attaches a `thoughtSignature` to each function
  call. Replayed calls without one trigger an AI SDK warning, and the SDK injects the documented
  `skip_thought_signature_validator` sentinel, so the request still succeeds. Ours lack it because:
  - the synthetic rep / profile round-trips and the mock model's calls never had one;
  - the stored history keeps `providerOptions` only if the SDK put them on the response message.
  This is harmless for now. If Google stops honouring the sentinel, keep `providerOptions.google.thoughtSignature`
  on stored agent tool calls, and mark synthetic calls as such.
- **Race**: `handleChatTurn` remembers when it loaded the conversation. Before saving, it re-applies answers given
  since then (`repQuestionsAnsweredSince`) through the same functions and recomputes its comparison, so a stale turn
  state can't overwrite a rep answer. That turn's reply text may still describe the unconfirmed value; its table is
  correct.
- **Rep screen** (`/rep`, `GET /api/rep/questions`): open questions as `RepQuestionView` (`rep-view.ts`, pure):
  - who is asking: occupation, group, current car + participation, short conversation id;
  - which car: label, group, catalog default, bound;
  - what is missing: the Hebrew field label and the question text.
  - No salary, pension or tax data (tested). Forms only allow typed values: a number with min/max, or picks from
    catalog / groups / occupations.
- **Employee screen**:
  - `GET /api/conversation` adds `repQuestions`: status only, never the answer.
  - A strip shows waiting / answered.
  - Old `participation_unconfirmed` / `rep_question_open` notices render as resolved.
  - The participation badge reads "אושרה ע״י נציג/ת".
  - A ping during a running turn is applied after the turn.
- **Realtime = broadcast ping + refetch.** The server sends an empty `ping` with `channel.httpSend` (REST, service
  role); a failure is only logged. Clients subscribe to public broadcast topics and refetch through the API routes.
  No row data goes through Realtime, and no new RLS policy is needed.
- **Polling fallback** (`ping-fallback.ts`, pure, fake-timer tested; `use-ping.ts` wires it):
  - refetches on every ping and on each SUBSCRIBED;
  - if not subscribed within `NEXT_PUBLIC_REALTIME_FALLBACK_MS` (5000), or after `CHANNEL_ERROR` / `TIMED_OUT` /
    `CLOSED`, it polls every `NEXT_PUBLIC_REALTIME_POLL_MS` (5000) until resubscribed;
  - `NEXT_PUBLIC_REALTIME_POLL=off` disables it (the e2e server sets this, so the e2e proves Realtime);
  - `data-realtime` on the screen root exposes the mode.
- **A7 data**: `data/challenge-script.json`. The brief gives group, base, commissions, pension, study fund, points,
  "switch to EV" and the rep's 350. Demo values for what it leaves open: bonus 0, 0 children, current CAR-09 @300,
  target CAR-10.

## 7c. Explanations, profile edits and car changes (M6)
- **Explanation (F4)**: `explainOption(today, option)` (`agent/explain.ts`), at most two plain-Hebrew lines, built
  in code from the two rows' `display` amounts:
  - line 1, the tax side: value-of-use from → to (so the tax goes up / down), or none any more; maintenance
    allowance (taxable, not pensionable), or the allowance stopping;
  - line 2, the net side: EV refund (gross), participation from → to (straight off the net), family-gap share;
  - a non-eligible option gets the engine's Hebrew `reason`; no change at all gets one fixed line.
  `ComparisonRow.explanation` carries it to the table (under the option name) and the cards. `compareReply` uses the
  same lines, so the chat and the table agree. A test checks every amount the sheet's "why" column names
  (except the rules' +250 net) appears.
- **Direct turns** (`direct-turn.ts`): the persistence shared by rep answers and employee edits. It covers the
  guarded reply built in code, notices, the synthetic tool round-trip, state and comparison, and the conversation
  ping. No LLM.
- **Profile edit (F5)**: `POST /api/profile` `{ conversationId?, updates: [{ field, value }] }` →
  `updateProfileDirect`:
  - the agent-origin updateProfile, with the source always `employee` (set on the server); percents as said; no id
    → a new conversation;
  - **rep-confirmed fields are locked** (409): a field with source `rep`, or a current car whose participation is
    rep;
  - an unknown value → 422 with the options;
  - recomputes the last comparison; the reply is "עדכנתי: …" plus the options summary, or what is still missing.
- **Car change (F5)**: `POST /api/compare` `{ conversationId, options }` (1–3 cars or waiver) → `changeOptions`.
  A participation from the client is dropped, so a new car always takes the rep's answer or the catalog default.
  An incomplete profile → 422 with the missing fields. The reply has one line per option plus today's net.
- **Screen**: `GET /api/conversation` adds `profile` (`profile-view.ts`):
  - form values (percents ×100 on the server), sources, locked fields and missing fields;
  - choices: the engine's `allowedCars`, all catalog cars, whether waiver is allowed, groups, occupations.
  Layout:
  - the profile panel is a side column from `lg` and a collapsible card on phones;
  - the option picker (swap / add / remove) sits above the comparison.
  The screen refetches after every chat turn, so agent-made profile changes show in the form. New server values
  update untouched fields only; unsaved edits stay.

## 7d. Production model and fallback (M7)
- `createAgentModel({ onFallback })` = `withFallback(Gemini, Claude?)` (`fallback-model.ts`), a `wrapGenerate`
  middleware, one instance per chat turn:
  1. a transient error (`model-errors.ts`: 429 / RESOURCE_EXHAUSTED, 503 / UNAVAILABLE / high demand, Anthropic 529
     overloaded) → wait `min(Retry-After or retryDelay, 3 s)` (default 1 s), retry the primary **once**;
  2. transient again → `onFallback()` (the route emits `status: fallback`, chip "עובר למודל גיבוי…"), then the
     **same call** (prompt, tools, settings) on the fallback; the rest of the turn, including the guard's
     regeneration, stays on it, so a turn never alternates providers;
  3. no fallback configured, or it is busy too → `ModelBusyError` → chat `error: busy` with a fixed Hebrew message
     (no digits); the turn stores nothing, as before. Other errors pass through unchanged (`failed`).
- Fallback: `@ai-sdk/anthropic` 4.0.82 (same `@ai-sdk/provider` as `ai`), `FALLBACK_MODEL` default
  `claude-haiku-5-5`, only when `ANTHROPIC_API_KEY` is set. Thinking is **disabled** on it (allowed on Haiku 5.5
  at effort ≤ high): the stored history drops reasoning parts between turns (`toolMessagesOnly`), and the turn must
  fit the route's time budget.
- runAgentTurn, the tools, the prompt and the number-guard are untouched: they only see a `LanguageModel`.
  Unit tests: the fallback gets the same system prompt and tool list; a tool step and the reply both run on it;
  the guard still blocks invented numbers there.
- The chat route passes `maxRetries: 0` (the wrapper retries; no stacking with the SDK's 2) and
  `abortSignal: AbortSignal.timeout(100 s)`; an abort is reported as `busy`. `maxDuration = 120` (Fluid compute
  allows 300).
- Evals: `createPrimaryModel()` / `createFallbackOnlyModel()` measure each provider alone (`EVAL_PROVIDER`).

## 7e. Security (M7)
- **Owner cookie** (`security/owner.ts`, `security/http.ts`): a browser without `advisor_owner` gets a random
  32-byte token (httpOnly, SameSite=Lax, Secure in production, 30 days) on the response that creates a
  conversation. `conversations.owner_hash` = SHA-256 of it. `handleChatTurn`, `updateProfileDirect`,
  `changeOptions` and `GET /api/conversation` open a conversation only when `ownsConversation` (constant-time
  compare); anyone else, and pre-M7 rows without owner, get the same `not_found` / 404 as a missing id. Rep
  answers don't check the owner (they need the rep session).
- **Rep session** (`security/rep-session.ts`): `POST /api/rep/login {code}` compares with `REP_ACCESS_CODE`
  (constant-time on SHA-256 digests) and sets `rep_session = <expiresAt>.<HMAC-SHA256(APP_SECRET)>` (httpOnly,
  SameSite=Strict, 12 h). `/api/rep/questions` and `/api/rep/answer` → 401 without it. `/rep` is a server gate
  (`cookies()` after `connection()`, inside Suspense) that renders the login form or the queue; logout clears the
  cookie; a 401 in the queue refreshes to the login form.
- **Rate limits** (`security/rate-limit.ts`): Postgres `hit_rate_limit(key, window, max)` (fixed window, atomic
  upsert, service role only), one round trip per request (all buckets in parallel; any bucket over → 429 with
  `Retry-After` and a Hebrew message without digits). Fails open if the DB call fails (logged). Limits (§10 for
  why per IP is loose): chat 60/min + 600/h per IP, 30/h per conversation, 300/day overall; profile / compare
  180/min; conversation GET 720/min; rep questions 360/min; rep answer 180/min; rep login 5 / 15 min.
  `RATE_LIMIT_SCALE` (e2e server: 20) multiplies every max. IP = first `x-forwarded-for` hop (set by Vercel).
- **Realtime topic**: `conversation:<HMAC(APP_SECRET, id)[0..32]>` (`conversation-topic.ts`, server only), sent to
  the owner as `topic` by `GET /api/conversation`; the client subscribes to what it receives. `rep-queue` stays a
  fixed public topic (a ping only triggers a refetch, which needs the rep cookie).
- **Deploy guard**: `deployEnvProblems` / `assertDeployEnv` (`env.ts`), called by `next.config.ts` when `VERCEL` is
  set: the four Supabase / Google keys, no `AGENT_MODEL=mock`, no `CONVERSATION_SOURCE=e2e`, `REP_ACCESS_CODE` ≥ 8,
  `APP_SECRET` ≥ 32. `npm run check:build` asserts the chat route's `.nft.json` traces `system-prompt.md`.

## 8. DB (Supabase)
```sql
conversations(id uuid pk, status text check (status in ('active','waiting_rep','done')), created_at, updated_at)
messages(id, conversation_id fk, role, content jsonb, created_at)
profiles(conversation_id pk fk, data jsonb, updated_at)
rep_questions(id, conversation_id fk, field, question, context jsonb,
              status text ('open','answered'), answer jsonb, answered_by, created_at, answered_at)
comparisons(id, conversation_id fk, result jsonb, created_at)
value_of_use(... see section 5)
```
Realtime (since M5): broadcast topics `conversation:<id>` and `rep-queue`, data-free pings (§7b). Migration
`0003_realtime_broadcast` (applied 18/10/2026 via Supabase MCP; `list_tables`, `get_advisors security` (no lints),
`check:db` green) removed `messages` and `rep_questions` from the `supabase_realtime` publication, so no table streams
row changes any more. `rep_questions.context.carId` holds a participation question's car; there was no column change.
The conversation id is in the URL (`/employee?c=...`), but since M7 it opens only in the browser that created it (§7e).
Schema: `supabase/migrations/0001_init.sql` (applied 17/10/2026 via Supabase MCP) and `0002_conversation_source.sql`
(18/10/2026): `conversations.source` (`app` | `e2e`). The e2e server sets `CONVERSATION_SOURCE=e2e`;
`npm run db:clean-e2e` and Playwright's global teardown delete those conversations (children cascade).
Conversation ids are random UUIDs (`gen_random_uuid()`).

**RLS (M7, migration `0004_m7_security`, applied 19/10/2026 via MCP; `list_tables`, `get_advisors security`, `check:db`
green):** enabled on all tables. The `demo_read` policies are dropped on conversations, messages, profiles,
rep_questions and comparisons: no policy, so the publishable key sees no rows (`check:db` fails if it does). Every
read and write goes through the API routes with the service-role key. `value_of_use` keeps its read policy (public
tax-authority data; `check:db` reads it that way). The migration also adds `conversations.owner_hash` (hex SHA-256,
null before M7) and `rate_limits(key, window_start, count)` + `hit_rate_limit()`; execute on the function is revoked
from public / anon / authenticated (Supabase grants it by default). The only advisor note is INFO
`rls_enabled_no_policy` on the six private tables, which is the intent.

## 9. Tests
- **Unit**: net (6 references + edge cases: below threshold, above ceiling, 0 points), eligibility (A8–A11), vou (20 cars + ATTO 3/TANG collision), config (invalid rules → error).
- **Agent unit tests** (mock model from `ai/test`, deterministic): tools vs. engine on the 6 references, number-guard (incl. an
  invented number), notices, prompt rules, regeneration and blocking.
- **Conversation evals** (`npm run eval:agent`, live Gemini, sequential with 429 backoff, skipped without a key): E-001…E-006
  from one Hebrew message (plus a follow-up turn if the model asks first) → updateProfile + compareOptions called, first line
  has the sheet's net and diff, guard never blocks, unconfirmed participation flagged; two A12 cases.
- **Chat unit tests** (memory store + mock model): event order, reply only in `result`, persistence, second turn,
  `waiting_rep`, blocked reply stored as the fallback, unknown id, model failure; comparison view has no computed numbers.
- **E2E (Playwright, `npm run test:e2e`, local only, ~1 min, not in the Stop hook)**: mock model on port 3100
  (`NEXT_DIST_DIR=.next-e2e`, so it runs next to `npm run dev`). E-001 full run (progress → reply → table → participation
  notice), reload restores it, missing-data and representative notices, E-001 at a phone viewport (cards, no horizontal
  scroll), UUID validation. M5 adds `rep.spec.ts`:
  - A7 + A13 with two pages: reload while waiting; the rep answers; the employee page updates **without a reload**,
    and its net equals the old net − (350 − catalog default); then reload again. Also a 422 above the bound and a
    409 on a second answer.
  - A12 with a current-car answer.
  - The rep screen at phone width.
  - API 400 / 404.
  M6 adds `profile.spec.ts`:
  - explanations visible;
  - today's participation +100 in the form → today's net −100, kept after a reload;
  - EV3, then back to ATTO 3 at the sheet's net; add waiver, then remove it;
  - an invalid value shows a Hebrew error;
  - the form can start a conversation;
  - phone: the panel is collapsed, no horizontal scroll.
  The dev and e2e servers bind to `127.0.0.1` (`next dev` listens on all interfaces by default, and the API routes
  use the service role). M7 adds the deployed URL.
- **M5 unit tests**: tool origin and rep participation, structured askRepresentative / RepAnswer, rep-answer service
  (A7 loop vs. the engine, guard, persistence across turns, 404 / mismatch / 409 / 422 / bound / failure re-open,
  race), rep view (no salary), store rep methods, ping fallback (fake timers), realtime env, replies, mock A7 /
  ask-rep, challenge config and participation bound.
- **M7 tests**:
  - unit: model errors (429 / 503 / 529 transient, 400 / 401 / 500 not), fallback (one retry with capped delay;
    switch + event; same prompt and tools; stays switched; guard still blocks; busy without / after fallback;
    non-transient untouched), chat busy / abort → `busy` and nothing stored, chat via the fallback reaches the
    E-001 net; owner (token, hash, cookie, store, chat / profile / compare not_found for others and legacy rows);
    rep session (code, sign / verify / expiry / tamper, cookie); rate limiter (window, keys, scale, one round trip,
    429 body, Supabase RPC mapping, fail open, the limits table); topic HMAC; deploy env problems.
  - e2e `security.spec.ts`: a second browser gets 404 on conversation / profile / compare and `not_found` from chat
    for someone else's id, and a leaked link shows the not-found error; the owner's topic is opaque; rep API 401
    without a session; wrong code → Hebrew error; right code → queue; logout → login form and 401.
    `rep.spec.ts` logs in first (`helpers.ts`) and calls the rep API through the context (its cookies).
  - e2e per-test timeout 60 s: every API call now also counts a rate-limit bucket in Postgres (~250 ms per round
    trip from the dev machine to Frankfurt; a few ms from Vercel fra1).
  - `tests/e2e/app.deployed.spec.ts` (project `deployed`, only with `E2E_BASE_URL`): smoke, no mock badge, the form
    starts a conversation another browser can't open, rep wall (login only with `E2E_REP_CODE`), one live E-001
    turn (follow-up allowed) at the sheet's net. Deletes its conversations by id afterwards.
  - CI (`.github/workflows/ci.yml`, every push / PR): lint, typecheck, unit, `next build` + `check:build`, then e2e in
    mock mode against the Supabase project (repo secrets; one run at a time; skipped with a notice without secrets).
- **M6 unit tests**:
  - model-facing schemas: no rep-only fields; spoofed `rep` stripped; flat updateProfile = the handler's list;
    occupation / group enums from the data; tool errors reported;
  - eval retry: 503 once, 429 backoff;
  - explanations: the six references, waiver, not eligible, no change;
  - profile view and locked fields;
  - profile edits and option changes: recompute, guard, 422 / 409 / not found, rep participation kept across swaps.

## 10. Open decisions
- [x] Participation for a new car (decided 18/10): the catalog `defaultParticipation`, with `participationSource: 'catalog_default'`
  and `needsConfirmation: true`. A value with source `rep` overrides it and clears the flag. Values stated by the employee
  (current car) need no confirmation.
- [x] EV (decided 18/10): both are supported, chosen by `rules.electric.method`: `gross_up` (default, exact +netBonus net) or
  `flat` (netBonus as taxable gross).
- [x] Diff rounding (decided 18/10): difference of the rounded values (see §3).
- [x] Value-of-use tax year (decided 18/10): `rules.valueOfUse.taxYear` (2026), not a code constant.
- [x] Value-of-use partial key (decided 18/10): one match → `found` with `matchedBy: 'partial'`, which the agent must
  confirm with the user; two or more → `ambiguous`, never picked (see §5).
- [x] Number-guard (decided 18/10): allowed = this turn's tool outputs + validated profile, display forms only; one
  regeneration, then a blocked fallback. Numbers written as Hebrew words are not detected (prompt requires digits).
- [x] Agent prompt language (decided 18/10): the prompt file is English; replies are Hebrew; a glossary pins the terms.
- [x] Missing / unconfirmed data is surfaced twice: by the prompt and by code-derived notices that the UI shows.
- [x] Local dev without LLM (decided 18/10, M4): `AGENT_MODEL=mock` scripted model over the real tools; refused in production.
- [x] Chat transport (decided 18/10, M4): custom NDJSON, not the AI SDK UI stream; progress events stream, the reply
  arrives once after the guard. The table renders `display` values only.
- [x] Persistence (decided 18/10, M4): Supabase from M4 behind `ConversationStore`; e2e rows tagged `source='e2e'` and cleaned up.
- [x] Rep answers (decided 18/10, M5): typed data applied through the tools with origin `rep`. The LLM can never
  set `rep`. Resumption is a deterministic reply (no LLM); the history keeps the tool round-trip.
- [x] Realtime (decided 18/10, M5): broadcast ping + refetch through the API, with a polling fallback;
  postgres_changes dropped (migration 0003). No new RLS.
- [x] A7 demo values (decided 18/10, M5): see §7b, `assumed` in the data file.
- [ ] Participation bound `rules.participation.max = 1000` is a demo value; confirm with Strauss. The effective
  bound is min(that, the car's monthly cost).
- [x] The rep answer's effective date ("בתוקף מ-1/1", decided 19/10, M6): **deferred to the pilot.** No calculation
  uses it: the engine is a monthly snapshot (rules have no time dimension), so a date changes no number,
  eligibility or confirmation. Showing it would be rep-typed text reaching the employee. It becomes a real input
  only with rules that change over time (tax-year tables, a participation change from a given month); then it
  means a per-month comparison.
- [x] Explanations (decided 19/10, M6): built in code from display values (§7c), not by the LLM; shared by table,
  cards and replies.
- [x] Employee edits vs. the rep (decided 19/10, M6): rep-confirmed fields are read-only in the form and rejected
  by `/api/profile`. The employee can raise it in the chat.
- [x] Dev / e2e servers on loopback only (decided 19/10, M6).
- [ ] M6 exit criterion: a test round with someone who hasn't seen the system (the user runs it).
- [ ] Payslip reading: Gemini vision → JSON, employee confirms each field.
- [x] RLS model for the public deploy (decided 19/10, M7): **fixed.** No anon reads on conversation data at all
  (policies dropped); access control lives in the API routes (owner cookie, rep session), which use the service
  role. Anonymous auth + `owner = auth.uid()` would only matter if the browser read tables directly; it doesn't.
- [x] M7: `GET /api/conversation` by id only: **fixed** with the owner cookie (§7e). Trade-off: a conversation can't
  be opened on another device by its link.
- [x] M7: rate limiting on `POST /api/chat` and every other route: **fixed** (§7e). Decided with the user at plan
  approval: judges at the venue share one Wi-Fi IP, so per-IP limits are deliberately loose (chat 60/min, 600/h;
  other routes ×6 the original plan) and the real protection is **30 turns / h per conversation and 300 / day
  overall**. Rep login stays at 5 / 15 min per IP (brute-force guard). The provider budget caps are the backstop.
- [x] M7: **production model and fallback** — **fixed** (§7d); the Haiku evals are still to run (needs
  `ANTHROPIC_API_KEY`: locally, since api.anthropic.com was reachable on 19/10, or the `eval-agent` workflow with
  `provider: anthropic`).
  - Gemini on the paid tier, with a budget cap set in Google Cloud billing.
  - On 429 / 503: retry once, then run the same turn on Claude Haiku. The tools, prompt and number-guard stay the
    same; only the `LanguageModel` changes.
  - If both fail: a fixed Hebrew "busy, try again" message with no digits, and the turn stores nothing (as today).
  - Nothing is lost, because conversation state is already persisted per turn (`handleChatTurn`).
  - To do in M7:
    - provider choice in `model.ts` (`ANTHROPIC_API_KEY` is already in the env schema);
    - a retry / fallback wrapper around `runAgentTurn`'s generation, with an event so the UI can show it;
    - re-run the live evals on Haiku before relying on it, since the prompt was tuned on Gemini.
- [x] M7: **the rep screen has no auth** — **fixed for the demo** with a shared access code + signed session cookie
  and rate limits (§7e). This is a deliberate demo-scope choice: **per-rep identities via Supabase magic link (plus an
  app role and private Realtime channels) are the next step for the pilot.** Until then `answeredBy` is a free
  text the rep types, not an identity.
- [x] M7: broadcast topics are public — **mitigated, known limit.** The conversation topic is an HMAC of the id that
  only the owner receives, so a leaked link no longer reveals it. Topics stay public channels: anyone with the
  publishable key who learns a topic can subscribe or send a ping, which carries no data and only triggers a refetch
  through the API (owner / rep checks apply). `rep-queue` is public by design. Private channels + Realtime
  Authorization need Supabase Auth (pilot).
- [x] M7: the `demo_read` policies — **fixed**: dropped on the five conversation tables, kept on `value_of_use`
  (migration 0004, §8).
- [x] M7: `POST /api/profile` and `POST /api/compare` — **fixed**: same owner check and rate limits (§7e).
- [x] M7: deploy (decided 19/10): Vercel `fra1` next to Supabase eu-central-1, env checked at build, mock refused,
  prompt trace checked (`check:build`), `maxDuration` 120 on chat. CI on every push (unit + e2e in mock mode).
- [ ] M7 exit: the deployed suite green on the public URL (after the user's Vercel / Supabase steps), and the Haiku
  evals run.
