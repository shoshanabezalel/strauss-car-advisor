# TECH DESIGN

## 1. Folder structure
```
data/
  strauss-rules.json          # source: sample rules file
  catalog.json                # from Excel sheet "קטלוג רכבים" (+ vehicleTypeCode = "1")
  occupations.json            # from sheet "עיסוקים"
  sample-employees.json       # "עובדים לדוגמה" + expected values from "חישובים"
  raw/                        # original files (xlsx, csv, pdf)
scripts/
  xlsx-to-json.ts             # converts the Excel to JSON (one-off)
  import-vou.ts               # CSV (cp1255) → value_of_use table
src/lib/config/   rules.ts, catalog.ts, occupations.ts   (load + Zod)
src/lib/engine/   net.ts, eligibility.ts, compare.ts, types.ts
src/lib/vou/      parse.ts, lookup.ts, memory-source.ts, supabase-source.ts
src/lib/agent/    schemas.ts, state.ts, tools.ts, system-prompt.md (+ .ts loader), number-guard.ts,
                  notices.ts, run-turn.ts, model.ts
src/app/employee/ , src/app/rep/ , src/app/api/chat/ , src/app/api/rep/
tests/unit/ , tests/e2e/ , tests/evals/ (live LLM, `npm run eval:agent`, not in `npm test`)
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
| `getCatalog` | `{}` (uses the profile) | `allowedCars` → `{ cars, missing }` |
| `checkEligibility` | `{ option: Situation }` | `checkEligibility` → `{ eligible, track, reason, missing }` |
| `getValueOfUse` | `{ makeCode, modelCode, regYear?, vehicleTypeCode?, taxYear? }` | lookup result + `mustConfirm` (= `matchedBy: 'partial'`) |
| `searchValueOfUse` | `{ query, regYear?, makeCode? }` | `{ status: 'candidates', candidates } \| { status: 'not_found' }` |
| `updateProfile` | `{ updates: [{ field, value, source }] }` | `{ ok: true, profile, sources, missing }` or `{ ok: false, errors: [{ field, error, options? }] }` |
| `compareOptions` | `{ options: Situation[] }` (1–4) | engine `compareOptions` + `display` per row (`net`, `diffVsToday`) |
| `askRepresentative` | `{ question, field, context? }` | `{ questionId, status: 'open' }` |

- `updateProfile` is all-or-nothing. It rejects an unknown group, occupation or car with the allowed options. Percent
  fields arrive as said (6 → the tool stores 0.06), so the LLM never converts. A stated current-car participation gets
  the update's source. `missing` comes from engine `missingProfileFields` (F2 fields).
- `display` uses `roundShekel` / `displayDiff` (§3), so the model quotes ready values and never subtracts.
- Rule: if an output has `missing`, the model asks the employee or the representative.

## 7. System prompt and number-guard
- Prompt: `src/lib/agent/system-prompt.md`, in English. The bot always replies in Hebrew. Sections: hard rules (never compute,
  never guess, at most two questions), workflow, signals (`missing`, `ambiguous`, `mustConfirm`/`partial`, `needsConfirmation`,
  `ok:false`, after `askRepresentative`), after `compareOptions` (first line = new net + diff from `display`, then at most two
  lines from `changes`), a glossary of Hebrew terms, and two Hebrew example replies. **No digits** (a test enforces it), so the
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
- Model: `model.ts`, Gemini via `@ai-sdk/google`, id from `AGENT_MODEL` (default `gemini-3.5-flash`).

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
Realtime: employee screen subscribes to the conversation's `rep_questions` and `messages`; rep screen to `rep_questions where status='open'`.
No auth in the demo: conversation id in the URL (`/employee?c=...`).
Schema: `supabase/migrations/0001_init.sql` (applied 17/10/2026 via Supabase MCP).

**RLS (demo):** enabled on all tables. One policy per table, `demo_read`: `select` for `anon, authenticated` using `true`, which Realtime and page loads need. There are no insert/update/delete policies, so the publishable key cannot write; API routes write with the service-role key. Known gap: anyone with the publishable key can read every conversation. **M7 must replace this** (e.g. per-conversation secret token checked in a policy or through RPC, or anonymous auth + `owner = auth.uid()`; rep screen behind a role).

## 9. Tests
- **Unit**: net (6 references + edge cases: below threshold, above ceiling, 0 points), eligibility (A8–A11), vou (20 cars + ATTO 3/TANG collision), config (invalid rules → error).
- **Agent unit tests** (mock model from `ai/test`, deterministic): tools vs. engine on the 6 references, number-guard (incl. an
  invented number), notices, prompt rules, regeneration and blocking.
- **Conversation evals** (`npm run eval:agent`, live Gemini, sequential with 429 backoff, skipped without a key): E-001…E-006
  from one Hebrew message (plus a follow-up turn if the model asks first) → updateProfile + compareOptions called, first line
  has the sheet's net and diff, guard never blocks, unconfirmed participation flagged; two A12 cases.
- **E2E (Playwright)**: full A7 including representative and refresh.

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
- [ ] Payslip reading: Gemini vision → JSON, employee confirms each field.
- [ ] RLS model for the public deploy (M7): conversation token vs. anonymous auth. Demo read-all policy is a stopgap.
