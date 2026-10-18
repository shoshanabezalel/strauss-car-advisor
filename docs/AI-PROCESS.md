# AI-PROCESS — log of working with AI tools

Per milestone: what I asked, how (plan mode / subagent / MCP), what came out, where the AI was wrong and how I caught it, decisions taken.

## Tools
- Claude Code (development), Gemini Flash / Claude Haiku (inside the product), Supabase MCP, Playwright MCP

## Log
### M0 — Setup (17/10/2026)
- **How:** plan mode → approval → scaffold Next.js 16 + shadcn (RTL), Zod schemas for data/*.json (tests first, 31 unit tests), Supabase clients, migration `0001_init.sql` applied through Supabase MCP `apply_migration`, Playwright config + smoke test (RTL + config loaded), `.env.example`, README, Stop hook running `npm test`.
- **Verification:** `list_tables` (6 tables, RLS on), `get_advisors security` (no lints), `npm run check:db` (service + publishable keys), `npm test`, `typecheck`, `lint`, `test:e2e` (which also boots `npm run dev`).
- **What went wrong:** the hosted Supabase MCP (HTTP + OAuth) failed in Claude Code with "Resource must be a valid MCP endpoint" when the URL carried `?project_ref`. Fixed by switching to the stdio server through `scripts/supabase-mcp.mjs`, which reads the token from `.env.local`, so `.mcp.json` holds no secrets.
- **Decisions:** demo RLS = read-only for anon, writes only via service role; tightening is logged as an open decision for M7. Access token is project-scoped with a short expiry (originally 24/10; renewed 18/10, now expires 17/11), with a reminder in the README and CLAUDE.md. The Stop hook was added last so it wouldn't fire on every intermediate turn of the setup.
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
### M2 — Value-of-use import + lookup (18/10/2026)
- **How:** plan mode → approval after three review rounds, which added:
  - name search over the trade, make and model names, with an explicit `not_found`
  - `partial` matches must be confirmed by the agent in M3
  - the PostgREST `or()` filter built by a single tested function that escapes and quotes values
- Before planning I profiled the CSV read-only: 77,988 rows, 19 columns each, no duplicate keys, and all 20 catalog cars match.
- Then tests first (red: missing module + a `taxYear` schema test), then parse → lookup → sources until green.
  The MCP servers now run from local devDependencies, because the npx registry check pushed startup past the 30 s timeout.
- **Verification:**
  - Tests: `npm test` (152), `typecheck`, `lint`.
  - `npm run import:vou` upserted 77,988 rows in ~40 s.
  - `npm run check:db`: all 20 catalog cars match from the DB with the publishable key, and ATTO 3/TANG comes back ambiguous.
  - Supabase MCP `execute_sql`: count, plus the ATTO 3 (type 1, 3130) / TANG (type 2, 6950) rows.
  - `get_advisors security`: no lints.
- **What went wrong:**
  - The plan cited the ATTO 3 key as 01014/**00012**. That code belongs to the DOLPHIN; the real ATTO 3 key is 00003.
    The tests were unaffected, because they look the car up by name in catalog.json. I caught the mistake when the verification SQL returned DOLPHIN.
  - PostgREST returns `numeric` columns as strings. `fromVouRow` converts them.
- **Decisions:**
  - Tax year comes from `rules.valueOfUse.taxYear`.
  - Columns are read by position (the header is wrong).
  - A partial-key unique match is returned as `found`/`partial`.
  - The engine keeps the catalog values, which are now proven equal to the table.
### M3 — Agent: tools + prompt + number-guard (18/10/2026)
- **How:** plan mode → approval after two review rounds, which added:
  - the first reply line after `compareOptions` must state the new net + diff, so the eval matches the prompt
  - the guard also accepts the validated profile, so the bot can echo "3 children" in a later turn
  - sequential evals with 429 backoff for free-tier Gemini
- The prompt language was discussed: the file is English (CLAUDE.md), the bot replies in Hebrew, and a glossary pins the terms.
- Installed AI SDK v7 (`ai`, `@ai-sdk/google`). Before writing tests, a scratch spike confirmed the v7 API
  (`instructions`, `isStepCount`, `MockLanguageModelV4`, per-step `response.messages`).
- Tests first: 61 new tests with throwing stubs. 55 were red. 6 "rejects invalid input" tests passed for the wrong reason,
  because a stub throws too. Then implemented engine `missingProfileFields` → tools → guard → notices → prompt → run-turn
  until green.
- **Verification:** `npm test` (213), `typecheck`, `lint`.
- **What went wrong:**
  - The live evals could not run: every Gemini call failed with "Blocked by NetFree" (the network filter on this machine).
    The M3 exit criterion (E-001…E-006 via chat) is still unverified, and M3 stays unticked until `npm run eval:agent`
    passes on an open network.
- **Decisions:**
  - Tools are split into plain handlers (tested directly) and AI SDK wrappers.
  - Tools return `display` values from the existing formatters.
  - Percent conversion happens in the tool.
  - Notices are derived in code.
  - One regeneration, then block.
  - The prompt has no digits.
- **First live run (GitHub Actions, 18/10):** E-001 and E-002 passed exactly (11,693 / +661 and 5,078 / −3,522, guard ok).
  E-003 and later hit Gemini's free-tier daily quota (retry-after ~25,000 s). Changes that followed:
  - The eval retry now fails at once with "daily quota exhausted" when the suggested wait is over 120 s.
  - **Efficiency:** the model called updateProfile 3× and getCatalog 2× per case. Cause: it needs car ids, and getCatalog
    only worked after the group was saved. Fix: `getCatalog({ scope: 'all' })` for name → id lookup, plus a prompt rule
    for one updateProfile call with every stated field. A mock test shows that one call completes the profile. The live
    eval now asserts 1 updateProfile and ≤1 getCatalog.
  - **Phrasing:** the diff is written as עלייה / ירידה + the absolute value, never with a minus sign. `display.direction`
    gives the sign as a word, and the eval checks it. The minus-sign check ignores Hebrew prefixes like "ל-5,078".
  - Actions bumped to checkout/setup-node v5 (Node 20 deprecation).
### M4 — End-to-end skeleton: employee screen + chat API (18/10/2026)
- **How:** plan mode → approval with additions:
  - responsive cards on phones + a mobile e2e run
  - random UUID conversation ids
  - `/api/conversation` exposure and `/api/chat` rate limiting logged for M7
  - `maxDuration = 60`
  - e2e rows tagged so they can be cleaned up (migration `0002_conversation_source`, applied via Supabase MCP;
    `list_tables`, `get_advisors security` (no lints), `check:db` green)
- **Mock model:** NetFree blocks Gemini on this machine, so `AGENT_MODEL=mock` runs a scripted model over the real
  tools, engine and number-guard. The script only picks tool calls; replies quote the tools' `display` values.
- **Tests first:** 46 new unit tests + throwing stubs; **60 red** (45 new; 15 existing compareOptions/run-turn/notices
  tests, because `display` now requires the table amounts). One new test ("no event carries model text") passed for the
  wrong reason, since no events existed yet. Then display → events → mock → chat service → routes → UI until green.
- **Verification:**
  - `npm test` (263), `typecheck`, `lint`.
  - `npm run test:e2e` (8, ~50 s): E-001 desktop + phone, reload, missing / rep notices, UUID checks.
  - Manual E-001 run via Playwright MCP: table 11,032 → 11,693, עלייה 661, EV 440, participation notice; reload
    restored it.
  - Supabase `execute_sql`: one `app` conversation with messages, profile and comparison; no `e2e` rows left.
- **What went wrong:**
  - Next 16 allows one `next dev` per project (lockfile), so e2e on its own port would fail next to a running dev
    server. Fixed with `distDir` from `NEXT_DIST_DIR` (`.next-e2e` for e2e).
  - First e2e run: 4 tests timed out at 5 s while the cold dev server compiled `/api/chat`. The mobile test passed, so
    streaming was fine. Raised the expect timeout to 15 s.
  - The mock answers instantly, so "progress is visible" would be flaky. Added `AGENT_MOCK_DELAY_MS` (400 in e2e).
  - The planned lucide icon names `CircleHelp` / `ShieldQuestion` no longer exist in lucide-react 1.x. Caught by
    checking the type declarations before typecheck.
  - `serverEnv()` would reject empty lines copied from `.env.example` (`AGENT_MODEL=`). Empty values now count as unset.
- **Decisions:**
  - Custom NDJSON instead of the AI SDK UI stream, so text can't leak before the guard.
  - Table amounts rounded server side in `display`; the UI only formats them (`Intl`, `signDisplay: "never"` for the diff).
  - The live evals skip themselves in mock mode.
  - M4 ticked on the mock run. A live-model browser run waits for an open network, like the M3 evals.
