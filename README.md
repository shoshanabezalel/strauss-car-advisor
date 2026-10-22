# Strauss Car Advisor

Hebrew (RTL) web app where an AI agent answers a Strauss employee's question: *"What happens to my net salary if I switch, or give up, my company car?"*
Every number comes from a deterministic engine driven by `data/strauss-rules.json`. The LLM only collects data and explains.

Built for the Open Code AI 2026 hackathon. Docs: [SPEC](docs/SPEC.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [TECH-DESIGN](docs/TECH-DESIGN.md) · [PLAN](docs/PLAN.md) · [AI-PROCESS](docs/AI-PROCESS.md)

## For judges

**Live:** https://strauss-car-advisor-smoky.vercel.app

### What it does
An employee describes their salary and current car in Hebrew, or uploads a payslip. The agent asks only for what is missing, then shows the net salary for each option (another car, an electric car, or giving up the car) next to today's net, with the change explained one line per component. When something only the company knows is missing (for example the employee's participation in a new car), the question goes to the car team. The comparison updates live once they answer.

**Search by conditions (F8):** instead of naming a car, the employee can state conditions, e.g. *"אני רוצה רכב חשמלי, אבל שהנטו לא ירד ביותר מ־100 ₪ בחודש"*. The agent turns them into parameters (drive type, how far the net may drop or must rise, max participation), and the engine checks every catalog car the employee is eligible for and computes its net. The cars that fit, best net first, go into the same comparison table; if none fits, the two closest are shown with the exact amount by which each misses. Every reason line is built in code from the engine's numbers.

### Try it in 3 steps
1. **Employee:** open the live URL and click **להתחלת שיחה**. Write your situation in Hebrew, e.g. *"שכר בסיס 18,000, קבוצה ג, 2 ילדים, יש לי היום BYD ATTO 3. כמה יישאר לי בנטו אם אוותר על הרכב?"*, or attach a payslip. A short tour explains the screen on the first visit.
2. **Ask the car team:** pick a car whose participation is not confirmed yet, then ask the agent to check it with the car team (*"אפשר לבדוק מול צוות הרכב?"*). The comparison marks that option as waiting for an answer. Or, with the profile filled in, try a search by conditions: *"אני רוצה רכב חשמלי, אבל שהנטו לא ירד ביותר מ־100 ₪ בחודש"*.
3. **Car team:** open **מסך צוות הרכב** in another tab and enter the access code. The code is not in this repo: it is the deploy's `REP_ACCESS_CODE` and comes with the submission form. Answer the question; the employee tab updates without a refresh. The **פערי מידע** tab shows what the catalog and rules were missing.

### Architecture in 5 lines
- Next.js 16 (App Router) on Vercel; Supabase Postgres + Realtime; Gemini through the Vercel AI SDK, with a fallback model.
- The LLM only talks and calls tools (Zod-validated); it never computes.
- A pure, deterministic engine computes every number from `data/strauss-rules.json`, the car catalog and the tax-authority value-of-use table.
- A number-guard rejects any reply with a number that is not in that turn's tool results; the comparison table is rendered from the engine's JSON, not from model text.
- Conversation state lives in the DB (survives refresh). RLS is on; the browser key reads no conversation table; every route is rate-limited.

### Original feature: information gaps log (מאגר פערי מידע)
Whenever the system cannot answer from real data, it records the gap: a participation still on the catalog default, a question sent to the car team, a car outside the catalog, or a question the agent has no rules for. The car team's **פערי מידע** tab groups them by topic with counts, a summary computed in code, an AI analysis that may cite only that summary's numbers, and a CSV export. It records company data only, no personal data. Strauss sees exactly what its catalog and rules are missing.

### Known limitations
- The net is an estimate from the company rules and 2026 tax tables, rounded to the shekel. It is not a payslip, and there is no payroll or HR integration (demo data from the challenge files).
- The car team signs in with one shared code (demo scope). A pilot needs per-person sign-in.
- A conversation opens only in the browser that started it (owner cookie). Another device starts a new one.
- Payslip reading uses the LLM; the employee must confirm every value, and unclear values stay empty. The file is not stored.
- The live agent depends on the Gemini API; rate limits apply per visitor.
- Hebrew only. Not yet tested with real employees.

## Stack
Next.js 16 (App Router) · React 19 · Tailwind 4 + shadcn/ui · Supabase (Postgres + Realtime) · Zod · Vitest · Playwright

## Setup
Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # fill in the values (see comments in the file)
npx playwright install chromium
```

### Database
The schema lives in [supabase/migrations/](supabase/migrations/). Apply it to your Supabase project via the Supabase MCP (`apply_migration`), or paste it into the SQL editor. Then check it:

```bash
npm run import:vou # load the tax-authority value-of-use CSV (~78k rows, idempotent)
npm run check:db   # tables reachable; RLS hides private tables from the publishable key; catalog cars match value_of_use
```

> **RLS (since M7):** every table has RLS on. Only `value_of_use` (public tax-authority data) is readable with the publishable key; the conversation tables and `rate_limits` have no policy, so the browser key sees nothing. Every read and write goes through the API routes with the service-role key. `check:db` fails if a private table becomes visible.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright, ~1.5 min, not in the Stop hook; CI runs them on every push). Starts its own mock-mode dev server on port 3100 (`.next-e2e`), so it can run next to `npm run dev`; rows it writes are tagged `e2e` and deleted at teardown |
| `E2E_BASE_URL=<url> npx playwright test` | The `deployed` suite only (`*.deployed.spec.ts`): smoke, owner isolation, rep wall, **the deploy's fallback model answers one real call**, one live E-001 turn. Deletes what it created by id. Needs `E2E_REP_CODE=<the deploy's rep code>` (the fallback check fails without it; each run uses two of the five logins per 15 min). Where the site is blocked locally (NetFree), run the `e2e-deployed` GitHub workflow instead: input `base_url`, repo secret `E2E_REP_CODE` |
| `npm run db:clean-e2e` | Delete conversations left by e2e runs (`source = 'e2e'`) |
| `npm run eval:agent` | Live agent evals against Gemini (needs `GOOGLE_GENERATIVE_AI_API_KEY`; not part of `npm test`). `EVAL_TARGET=fallback` runs them on the fallback model alone (`FALLBACK_MODEL`, e.g. `gemini-3.8-flash`); the `eval-agent` GitHub workflow does either |
| `npm run build` then `npm run check:build` | Production build, then check that the agent prompt file is in the chat route's file trace |
| `npm run check:fallback` | One real call to the configured fallback model (`FALLBACK_MODEL`) from this machine; fails if it doesn't answer (a listed model can still be unavailable) |
| `npm run typecheck` | TypeScript check |
| `npm run check:db` | Supabase connectivity + table check + value-of-use lookup against the DB |
| `npm run import:vou` | Import `data/raw/vou-2026.csv` into `value_of_use` (`-- --dry-run` parses only) |
| `npm run data:convert` | Regenerate `data/*.json` from `data/raw/challenge-data.xlsx` |

### Mock mode (no LLM access)
Where the LLM is unreachable (e.g. a network filter), run the UI against a scripted model:

```bash
AGENT_MODEL=mock npm run dev        # PowerShell: $env:AGENT_MODEL="mock"; npm run dev
```

The screen shows a "מצב הדגמה" badge and demo prompts (the six sample employees, missing data, a representative question, an ambiguous value-of-use). The script only chooses tool calls; the real tools, engine and number-guard produce every number. `AGENT_MOCK_DELAY_MS` adds a delay per model step. Mock mode is refused when `NODE_ENV=production`.

## Deploy (Vercel)
- Region `fra1` (`vercel.json`), next to the Supabase project (eu-central-1). Node 22 (`engines`).
- Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `FALLBACK_MODEL=gemini-3.8-flash`, `APP_SECRET` (32+ chars), `REP_ACCESS_CODE` (8+ chars); optional `AGENT_MODEL`, `ANTHROPIC_API_KEY` (with `FALLBACK_MODEL=claude-…`, or alone for Haiku). Never `AGENT_MODEL=mock`, `CONVERSATION_SOURCE` or `RATE_LIMIT_SCALE`.
- On Vercel, `next.config.ts` checks these and **fails the build** with a list of what is missing or wrong (`deployEnvProblems` in `src/lib/env.ts`).
- The chat route runs up to 120 s (`maxDuration`); a turn stops itself at 100 s with a Hebrew "busy" message.

## Security (demo scope)
- **Employees:** the browser that starts a conversation gets an httpOnly `advisor_owner` cookie; the DB keeps its SHA-256. Every employee route answers 404 to anyone else, so a leaked `?c=` link opens nothing in another browser (and a conversation can't move to another device).
- **Representatives:** `/rep` asks for the shared `REP_ACCESS_CODE` and sets a signed 12-hour cookie; `/api/rep/*` answers 401 without it. Per-rep sign-in (Supabase magic link) is the pilot step.
- **Rate limits** on every API route, counted in Postgres (`hit_rate_limit`): loose per IP (a venue shares one IP), 30 chat turns per conversation per hour, 300 per day overall, 5 rep logins per 15 minutes. See `src/lib/security/rate-limit.ts`.
- **Realtime:** topics are public broadcast channels carrying only a data-free ping; a conversation's topic is an HMAC of its id that only its owner receives.
- **Model fallback:** Gemini, one retry on 429 / 503, then the fallback model (`FALLBACK_MODEL`: a second Gemini model on the same key, or Claude) with the same tools, prompt and number-guard, then "busy".

## Information gaps log (מאגר פערי מידע)
Our original feature: every time the advisor can't answer from real data, it is recorded, so Strauss can see what
the catalog and the rules are missing and fix it.
- **What is logged:**
  - a participation that had to fall back to the catalog default, and questions sent to the car representative
    (`referred_to_rep`);
  - cars that are not in the catalog (`unknown_vehicle`);
  - questions the agent had no information for (`no_data`, via its `logInformationGap` tool).
- **What is not logged:** what only the employee can tell (salary, pension, children). No names, salaries or other
  personal details are stored.
- **Where:** the rep screen, tab "פערי מידע" (behind the access code):
  - cards per type and this week vs last week, the top topics;
  - the grouped list (count of conversations, last seen) with a "טופל" toggle;
  - **ניתוח AI**: 3–5 insights with a recommended action. The model receives only the summary and may cite only its
    numbers; with fewer than 5 gaps it says there is not enough data;
  - **ייצוא CSV**: UTF-8 with BOM, opens in Excel in Hebrew.
- Design: [TECH-DESIGN §7f](docs/TECH-DESIGN.md).

## Claude Code / MCP
`.mcp.json` configures two project MCP servers:
- **supabase**: [scripts/supabase-mcp.mjs](scripts/supabase-mcp.mjs) reads `SUPABASE_ACCESS_TOKEN` from `.env.local` so no secret lives in `.mcp.json`.
- **playwright**: browser automation for manual UI checks.

> ⚠️ **`SUPABASE_ACCESS_TOKEN` expires on 17/11/2026.** Before then, regenerate it at https://supabase.com/dashboard/account/tokens, **scoped to this project only**, and update `.env.local`. After that date the Supabase MCP stops working, but the app keeps running because it never uses this token.

## Project layout
```
data/                rules, catalog, occupations, sample employees (JSON) + raw sources
src/lib/config/      Zod schemas + loaders for data/*.json
src/lib/engine/      net + eligibility + comparison (pure)
src/lib/vou/         value-of-use parse + lookup
src/lib/agent/       tools, prompt, number-guard, notices, run-turn, mock model
src/lib/chat/        chat turn handler, conversation store (Supabase / memory), comparison view
src/lib/security/    owner cookie, rep session, rate limits (M7)
src/lib/gaps/        information gaps: derive, group, summary, AI analysis, CSV (G)
src/app/employee/    employee screen (chat + comparison)
src/app/rep/         representative screen (access code, open questions, information gaps)
src/app/api/         /api/chat (NDJSON stream), /api/conversation, /api/profile, /api/compare, /api/rep/*
src/lib/supabase/    browser / server / admin clients
supabase/migrations/ DB schema
scripts/             data conversion, DB check, build check, e2e cleanup, MCP launcher
.github/workflows/   ci (lint, types, unit, build, e2e on push) · eval-agent (manual live evals) · e2e-deployed (manual, public URL)
tests/unit/          Vitest
tests/e2e/           Playwright
```
