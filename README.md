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
npm run check:db   # every table reachable; catalog cars match value_of_use in the DB
```

> **RLS (demo only):** every table has RLS on, with a read-only `demo_read` policy for `anon`/`authenticated` so Realtime and page loads work without auth. All writes go through server API routes using the service-role key. These policies must be tightened before the public deploy (M7).

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright, ~1 min, local only, not in the Stop hook). Starts its own mock-mode dev server on port 3100 (`.next-e2e`), so it can run next to `npm run dev`; rows it writes are tagged `e2e` and deleted at teardown. Set `E2E_BASE_URL` to test a deployed URL instead |
| `npm run db:clean-e2e` | Delete conversations left by e2e runs (`source = 'e2e'`) |
| `npm run eval:agent` | Live agent evals against Gemini (needs `GOOGLE_GENERATIVE_AI_API_KEY`; not part of `npm test`) |
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
src/app/employee/    employee screen (chat + comparison)
src/app/api/         /api/chat (NDJSON stream), /api/conversation
src/lib/supabase/    browser / server / admin clients
supabase/migrations/ DB schema
scripts/             data conversion, DB check, MCP launcher
tests/unit/          Vitest
tests/e2e/           Playwright
```
