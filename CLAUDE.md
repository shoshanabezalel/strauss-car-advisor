# Strauss Car Advisor — Claude Code instructions

Hebrew (RTL) web app: an AI agent answers a Strauss employee "what happens to my net salary if I switch/waive my company car?".
Hackathon: Open Code AI 2026. Final: Wed 28/10/2026.

## Source of truth (read before any task)
- docs/SPEC.md — requirements & acceptance scenarios
- docs/ARCHITECTURE.md — components & data flow
- docs/TECH-DESIGN.md — data model, engine algorithm, tool schemas, DB
- docs/PLAN.md — milestones; tick checkboxes when a milestone's exit criteria pass
- data/ — rules JSON, catalog, occupations, sample employees, tax-authority CSV

## Hard rules (never violate)
1. **The LLM never computes numbers.** Every number shown to a user comes from a tool result (engine). The model only collects data and explains.
2. **No guessing.** Missing/unclear data → ask the employee, or call `ask_representative`. Never invent eligibility, participation, value-of-use.
3. **All business rules come from `data/strauss-rules.json`** (+ catalog/occupations JSON). No magic numbers in code. Changing data must not require code changes.
4. **Engine is pure & deterministic**: same input + same rules = same output. No rounding during calculation; round to whole shekel only in UI.
5. The 6 reference employees (data/sample-employees.json, from Excel sheet "חישובים") are acceptance tests. **Never edit expected values to make a test pass.**
6. UI is Hebrew, `dir="rtl"`. Code, identifiers, commits in English.
7. Secrets only in `.env.local` (never committed). Provide `.env.example`.

## Data gotchas
- Value-of-use key = tax year + registration year + **vehicle type code** + manufacturer code + model code. Without vehicle type code there are collisions (e.g. 01014/00003/2025 → ATTO 3 *and* TANG).
- CSV is windows-1255, fields padded with spaces → trim. Codes have leading zeros → keep as strings.
- The CSV header for drive type ("1-חשמלי.2-היברידי.3-פלג-אין") is WRONG. Real mapping (per rules JSON): 0 petrol, 1 hybrid, 2 plug-in, 3 electric.

## Workflow
- Start every non-trivial task in plan mode; wait for approval.
- Test-first: write/extend tests, then implement until green. Run `npm test` before declaring done.
- One milestone per session; commit at the end with a clear message; update docs/PLAN.md and docs/AI-PROCESS.md (decisions, what went wrong).
- If a spec is ambiguous → stop and ask, and log the decision in TECH-DESIGN "Open decisions".

## Commands
- `npm run dev` · `npm test` · `npm run test:e2e` · `npm run typecheck` · `npm run check:db` · `npm run data:convert` (xlsx → data/*.json) · `npm run import:vou` (CSV → DB, from M2) · `npm run eval:agent` (live LLM evals, not in `npm test`)

## Database & MCP
- Schema changes = new file in `supabase/migrations/NNNN_name.sql`, applied via Supabase MCP `apply_migration` (same name), then `list_tables` + `get_advisors security` + `npm run check:db`. Never edit an applied migration.
- RLS is on for every table. Current policies are **demo-only read for anon** (see TECH-DESIGN §8); all writes go through API routes with the service-role key (`src/lib/supabase/admin.ts`, server only). Tighten before the M7 deploy.
- Supabase MCP runs via `scripts/supabase-mcp.mjs` (token from `.env.local`). `SUPABASE_ACCESS_TOKEN` expires 17/11/2026 — remind the user to regenerate it (project-scoped) if it is close or MCP auth fails.
- A Stop hook runs `npm test` when Claude finishes a turn; a failing hook means tests are red — fix them, don't bypass.

## Language
- All code, docs, prompts, commits and files for Claude Code: **English**.
- Only user-facing UI text and bot replies are Hebrew. Hebrew values from the source data (group names א–ד, occupation names) are kept as-is.

## Git commits
- Subject: imperative, English, max 50 chars, no period. Prefix with milestone: `M1: add net engine`
- Body: optional. Only if the "why" isn't obvious. Max 3 short bullets, wrap at 72.
- No file lists, no test counts, no "this commit…", no emoji, no Co-Authored-By.
- One logical change per commit. Push to origin after each milestone commit.
- Never use `git add -A`. Stage specific files and run `git status` before committing.
