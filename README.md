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
| `npm run test:e2e` | E2E tests (Playwright). Starts `npm run dev` itself; set `E2E_BASE_URL` to test a deployed URL instead |
| `npm run typecheck` | TypeScript check |
| `npm run check:db` | Supabase connectivity + table check + value-of-use lookup against the DB |
| `npm run import:vou` | Import `data/raw/vou-2026.csv` into `value_of_use` (`-- --dry-run` parses only) |
| `npm run data:convert` | Regenerate `data/*.json` from `data/raw/challenge-data.xlsx` |

## Claude Code / MCP
`.mcp.json` configures two project MCP servers:
- **supabase**: [scripts/supabase-mcp.mjs](scripts/supabase-mcp.mjs) reads `SUPABASE_ACCESS_TOKEN` from `.env.local` so no secret lives in `.mcp.json`.
- **playwright**: browser automation for manual UI checks.

> ⚠️ **`SUPABASE_ACCESS_TOKEN` expires on 17/11/2026.** Before then, regenerate it at https://supabase.com/dashboard/account/tokens, **scoped to this project only**, and update `.env.local`. After that date the Supabase MCP stops working, but the app keeps running because it never uses this token.

## Project layout
```
data/                rules, catalog, occupations, sample employees (JSON) + raw sources
src/lib/config/      Zod schemas + loaders for data/*.json
src/lib/supabase/    browser / server / admin clients
supabase/migrations/ DB schema
scripts/             data conversion, DB check, MCP launcher
tests/unit/          Vitest
tests/e2e/           Playwright
```
