# Strauss Car Advisor

Hebrew (RTL) web app where an AI agent answers a Strauss employee's question: *"What happens to my net salary if I switch, or give up, my company car?"*
Every number comes from a deterministic engine driven by `data/strauss-rules.json`. The LLM only collects data and explains.

Built for the Open Code AI 2026 hackathon. Docs: [SPEC](docs/SPEC.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [TECH-DESIGN](docs/TECH-DESIGN.md) · [PLAN](docs/PLAN.md) · [AI-PROCESS](docs/AI-PROCESS.md)

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
| `E2E_BASE_URL=<url> npx playwright test` | The `deployed` suite only (`*.deployed.spec.ts`): smoke, owner isolation, rep wall, one live E-001 turn. Deletes what it created by id. `E2E_REP_CODE=<code>` also tests the rep login (one of five tries per 15 min) |
| `npm run db:clean-e2e` | Delete conversations left by e2e runs (`source = 'e2e'`) |
| `npm run eval:agent` | Live agent evals against Gemini (needs `GOOGLE_GENERATIVE_AI_API_KEY`; not part of `npm test`). `EVAL_PROVIDER=anthropic` runs them on the fallback model (needs `ANTHROPIC_API_KEY`); the `eval-agent` GitHub workflow does either |
| `npm run build` then `npm run check:build` | Production build, then check that the agent prompt file is in the chat route's file trace |
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
- Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `APP_SECRET` (32+ chars), `REP_ACCESS_CODE` (8+ chars); optional `AGENT_MODEL`, `FALLBACK_MODEL`. Never `AGENT_MODEL=mock`, `CONVERSATION_SOURCE` or `RATE_LIMIT_SCALE`.
- On Vercel, `next.config.ts` checks these and **fails the build** with a list of what is missing or wrong (`deployEnvProblems` in `src/lib/env.ts`).
- The chat route runs up to 120 s (`maxDuration`); a turn stops itself at 100 s with a Hebrew "busy" message.

## Security (demo scope)
- **Employees:** the browser that starts a conversation gets an httpOnly `advisor_owner` cookie; the DB keeps its SHA-256. Every employee route answers 404 to anyone else, so a leaked `?c=` link opens nothing in another browser (and a conversation can't move to another device).
- **Representatives:** `/rep` asks for the shared `REP_ACCESS_CODE` and sets a signed 12-hour cookie; `/api/rep/*` answers 401 without it. Per-rep sign-in (Supabase magic link) is the pilot step.
- **Rate limits** on every API route, counted in Postgres (`hit_rate_limit`): loose per IP (a venue shares one IP), 30 chat turns per conversation per hour, 300 per day overall, 5 rep logins per 15 minutes. See `src/lib/security/rate-limit.ts`.
- **Realtime:** topics are public broadcast channels carrying only a data-free ping; a conversation's topic is an HMAC of its id that only its owner receives.
- **Model fallback:** Gemini, one retry on 429 / 503, then Claude Haiku with the same tools, prompt and number-guard, then "busy".

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
src/app/employee/    employee screen (chat + comparison)
src/app/rep/         representative screen (access code, open questions)
src/app/api/         /api/chat (NDJSON stream), /api/conversation, /api/profile, /api/compare, /api/rep/*
src/lib/supabase/    browser / server / admin clients
supabase/migrations/ DB schema
scripts/             data conversion, DB check, build check, e2e cleanup, MCP launcher
.github/workflows/   ci (lint, types, unit, build, e2e on push) · eval-agent (manual live evals)
tests/unit/          Vitest
tests/e2e/           Playwright
```
