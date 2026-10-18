# AI-PROCESS — log of working with AI tools

Per milestone: what I asked, how (plan mode / subagent / MCP), what came out, where the AI was wrong and how I caught it, decisions taken.

## Tools
- Claude Code (development), Gemini Flash / Claude Haiku (inside the product), Supabase MCP, Playwright MCP

## Log
### M0 — Setup (17/10/2026)
- **How:** plan mode → approval → scaffold Next.js 16 + shadcn (RTL), Zod schemas for data/*.json (tests first, 31 unit tests), Supabase clients, migration `0001_init.sql` applied through Supabase MCP `apply_migration`, Playwright config + smoke test (RTL + config loaded), `.env.example`, README, Stop hook running `npm test`.
- **Verification:** `list_tables` (6 tables, RLS on), `get_advisors security` (no lints), `npm run check:db` (service + publishable keys), `npm test`, `typecheck`, `lint`, `test:e2e` (which also boots `npm run dev`).
- **What went wrong:** the hosted Supabase MCP (HTTP + OAuth) failed in Claude Code with "Resource must be a valid MCP endpoint" when the URL carried `?project_ref`. Fixed by switching to the stdio server through `scripts/supabase-mcp.mjs`, which reads the token from `.env.local`, so `.mcp.json` holds no secrets.
- **Decisions:** demo RLS = read-only for anon, writes only via service role; tightening is logged as an open decision for M7. Access token is project-scoped with a short expiry (24/10), with a reminder in the README and CLAUDE.md. The Stop hook was added last so it wouldn't fire on every intermediate turn of the setup.
### M1 — Net engine + eligibility (18/10/2026)
- **How:** plan mode → approval, which added three requests: define diff rounding, `allowedCars` with unknown children, push at the end.
  Tests first: 71 engine tests plus throwing stubs, so typecheck passed and every engine test was red before any engine code
  (31 config tests stayed green). Then net → eligibility → compare until green. No MCP/DB this milestone.
- **Tests (102 total):**
  - The 6 references, checking net, tax, NI+health, EV gross, family gap, eligibility/reason and diff against `sample-employees.json`.
  - A8–A11.
  - Missing-data cases.
  - Edge cases: below the NI threshold, tax clamped to 0, above the ceiling / top bracket, 0 points, partial pension credit.
  - EV: gross_up exactness to 1e-6; flat vs gross_up −107.925, hand-computed.
  - Purity on deep-frozen input.
  - Config-driven changes: credit point value, budget, gap split.
- **Verification:** before writing the plan, I hand-computed E-001 from TECH-DESIGN §3 (tax 3443.15, NI+health 2152.5, net 11031.8),
  and it matched the sheet. All 6 references passed on the first green run, and no expected value was touched.
  `npm test`, `typecheck` and `lint` are green.
- **Diff rounding finding:** E-003 (exact −1938.68) and E-006 (exact 721.70) show that the sheet subtracts the rounded nets.
  Rounding the exact diff would give −1939 / 722. The test pins that convention, and the list of disagreeing rows was computed
  from engine output, not taken from the sheet.
- **What went wrong:** a stray `cat >` with no input hung a helper shell command for 2 minutes (it was backgrounded and stopped).
  I re-ran it as a scratchpad `tsx` script with stdin closed.
- **Decisions:**
  - Participation = catalog default with `needsConfirmation`, and a rep override is allowed.
  - EV method = `gross_up` | `flat`, chosen by rules.
  - Group derived from the occupation when absent.
  - "Today" is not eligibility-gated.
  - The engine also honours the rules flags `maintenanceIsTaxable` / `maintenanceIsPensionable` / `reducesValueOfUse`
    instead of hard-coding them.
