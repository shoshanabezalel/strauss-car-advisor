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
src/lib/vou/      lookup.ts
src/lib/agent/    tools.ts, system-prompt.ts, number-guard.ts
src/app/employee/ , src/app/rep/ , src/app/api/chat/ , src/app/api/rep/
tests/unit/ , tests/e2e/ , tests/evals/
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
  | { kind: 'car'; carId: string; participation: number }
  | { kind: 'waiver' };       // maintenance derived from occupation

interface OptionResult {
  situation: Situation; eligible: boolean; reason: string;   // reason in Hebrew (user-facing)
  budget: number; carCost: number; participation: number; familyGapEmployee: number;
  valueOfUse: number; maintenance: number; electricGross: number;
  gross: number; taxableIncome: number; tax: number; nationalInsurance: number; health: number;
  pension: number; studyFund: number; net: number;           // unrounded
  diffVsToday?: number; changes: Change[];                   // structured facts for the explanation
  missing?: string[];                                        // if missing → no net
}
```

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
`net(with G) − net(G=0) = 250` (no rounding). Reference results: 440 / 473 ILS.
**Rounding**: display only (whole shekel).

Reference for tests (net today → alternative, EV gross):
E-001 11,032→11,693 (440) · E-002 8,600→5,078 · E-003 15,047→13,109 (473) ·
E-004 10,693→11,900 (440) · E-005 14,244→17,806 · E-006 17,073→17,794 (473)

## 4. Eligibility (`checkEligibility`)
Check order; each returns a Hebrew `reason`:
1. Waiver: occupation `carMandatory` → no; `waiverAllowed=false` → no; else maintenance per occupation.
2. Family car: `childrenUnder23 ≥ 4` → eligible; gap per the car's catalog cost.
3. Regular car: `groupOrder.indexOf(car.group) ≤ indexOf(employee.group)`.
4. Unknown group / occupation → `missing`, never a guess.

## 5. Value-of-use
- Table `value_of_use(tax_year, reg_year, vehicle_type_code, make_code, model_code, ...)`, PK on all five.
- Import: decode cp1255, trim, codes as strings, drive mapping per rules.valueOfUse.driveField (the CSV header is wrong).
- Test: for all 20 catalog cars — table value = catalog value.
- Car not in catalog → search by make/trade name returns candidates; more than one → ask, never pick.

## 6. Agent tools (Zod)
| Tool | Input | Output |
|---|---|---|
| `getCatalog` | `{ group, includeFamily }` | allowed cars |
| `checkEligibility` | `{ option }` (uses profile) | `{ eligible, reason, missing? }` |
| `getValueOfUse` | full key | `{ value, record } \| { candidates[] }` |
| `updateProfile` | `{ field, value, source }` | updated profile + `missing[]` |
| `compareOptions` | `{ options: Situation[] }` | `{ today: OptionResult, options: OptionResult[] }` |
| `askRepresentative` | `{ question, field, context }` | `{ questionId, status:'open' }` |

Rule: if `compareOptions` returns `missing`, the model must ask the employee or the representative.

## 7. System prompt — essentials (the prompt itself is written in English; the bot replies in Hebrew)
- Reply in Hebrew, warm and short; one or two questions at a time; only what the profile is missing.
- Never write a number that did not come from a tool. Never calculate.
- Data the employee cannot know that belongs to the company (participation for a new car, exceptions) → `askRepresentative`.
- After `compareOptions`: explanation of up to 2 lines from `changes`; the table is rendered by the UI.

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
- **Conversation evals**: script that runs scenarios against the API and checks: tools called, no invented numbers (number-guard), rep question when needed.
- **E2E (Playwright)**: full A7 including representative and refresh.

## 10. Open decisions
- [ ] Participation for a new car: use catalog default (marked "per catalog — to confirm") or always ask the representative? (References use the default.) Proposed: catalog default; rep only for cars outside the catalog or disputes.
- [ ] EV gross-up: gross_up (default) or 250 gross — per `electric.method`.
- [ ] Payslip reading: Gemini vision → JSON, employee confirms each field.
- [ ] RLS model for the public deploy (M7): conversation token vs. anonymous auth. Demo read-all policy is a stopgap.
