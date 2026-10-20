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
### M5 — Rep screen + Realtime + state persistence (18/10/2026)
- **How:** plan mode, read the brief's A7 script (the rep answers "350 ₪", the bot resumes), three questions to the
  user (A7 demo values, deterministic resumption vs. an LLM turn, broadcast vs. postgres_changes), approval with two
  additions: an explicit polling fallback with unit tests, and an upper bound on rep-entered participation from data
  (then a fourth question: bound = min(rules max, the car's monthly cost)).
- **Gaps found while planning:**
  - `askRepresentative.field` was free text, so an answer couldn't be mapped to data.
  - **The LLM could fake a rep confirmation:** it could send `participationSource: "rep"` to compareOptions or
    `source: "rep"` to updateProfile, and needsConfirmation would clear. Fixed with tool origins: the LLM's tools
    reject both, and only the rep-answer service uses `origin: "rep"`.
  - A new-car participation confirmed by the rep would be lost on the next agent turn, because the model calls
    compareOptions without participation. Fixed by `state.repParticipation`, which the tool applies.
- **Tests first:** 14 test files touched, **50 red** (36 failing tests + the rep-answer file, 14 tests, failing at load)
  against throwing stubs. Three new guard tests passed for the right reason: they lock in existing behaviour (the rep
  origin accepts `rep`, other cars keep the catalog default, an option without participation takes the default). Then:
  schemas/tools → config/data → mock → store → realtime → rep-answer → routes → UI.
- **Existing tests changed (contract, not expected values):**
  - notices.test: the "stated participation" case no longer sends `participationSource: "rep"`, which the model may
    not send now.
  - tools.test: askRepresentative for participation now passes the car id.
  - config.test: the fresh config includes the challenge script.
- **Verification:**
  - `npm test` (316), `typecheck`, `lint`.
  - Migration `0003_realtime_broadcast` via MCP, then `list_tables`, `get_advisors security` (no lints),
    `check:db` green.
  - `npm run test:e2e`: 12 green on the first run, including A7 + A13 with two pages. The employee page updated
    without a reload while polling was off, so the update came through Realtime.
  - Manual run via Playwright MCP: A7 → ask the rep → rep screen (context: group, Corolla Cross @300, ATTO 3 default
    300) → answer 350 → the employee tab updated in place: 9,977 → 9,927 (−50 = 350 − 300), "אושרה ע״י נציג/ת",
    and the old notices showed as resolved. `execute_sql`: question answered with typed JSON, comparison
    participation 350 / rep / needsConfirmation false. No console errors. e2e rows cleaned.
- **What went wrong:**
  - Stamping `participationSource: "employee"` on model-stated participation changed the tool output against the M3
    "wraps the engine" tests. Dropped it; the tool output stays identical to the engine, and the recompute keeps
    anything that is not catalog-default / rep.
  - The new React lint rule (`set-state-in-effect`) flagged async loaders called from effects and the
    `setMode("connecting")` reset in `usePing`. Loaders became promise chains, and the hook keys its mode by topic.
  - Bash heredocs holding Hebrew text failed twice on quoting (nothing was written either time). Larger edits now go
    through Write or a script file.
  - `next dev` with a new `NEXT_DIST_DIR` adds that dir to tsconfig `include`. Reverted after the manual run.
  - A manual screenshot showed "טוען…" because my label edit triggered HMR during the run. Retaken.
- **Decisions:**
  - Resumption is deterministic: the answer goes through the tools and the engine, and the reply is built from
    `display` and guarded. No LLM, so it works the same in mock and live.
  - Realtime is a data-free broadcast ping + refetch. postgres_changes is dropped from the publication, with no new
    RLS. M7 can remove anon reads entirely.
  - Rep screen without auth and public broadcast topics are logged for M7 (TECH-DESIGN §10).
  - Risk to check in tomorrow's live evals: the stored rep round-trip puts an assistant tool-call message right
    after an assistant reply in the history (two assistant turns in a row).
- **Follow-up (same day): consecutive assistant turns.**
  - Read `@ai-sdk/google` 4.0.99 `convertToGoogleMessages`: each assistant message becomes its own `model` content,
    with no merging, so the A7 history really did send `model, model` to Gemini.
  - Test first (2 red): drive the real Google provider through a captured `fetch` with an A7 history (rep reply,
    then an employee turn) and assert alternating roles; check that merging keeps every part and every
    call / result id.
  - Fix: `toModelHistory` merges consecutive assistant / tool messages when the model history is built. The stored
    history is unchanged. 319 unit, 12 e2e.
### M6 — Live evals, explanations, profile edits, car changes (19/10/2026)
- **How:** plan mode, then approval. The user approved by typing the reason for rejecting the tool rather than
  clicking approve, twice; I went ahead on that, and said so when asked. Before M6 work: live evals, including a new
  A7 case (mock setup, rep answer through `answerRepQuestion`, then one live turn on the merged history).
- **Live evals (Gemini, NetFree now allows it):**
  - Run 1 (free tier): E-001 to E-003 had correct numbers but called updateProfile twice. Then the daily quota
    ran out, so E-004 and on were never evaluated.
  - My first guess (participationSource in the schema) was **wrong**. I added logging of tool inputs and errors
    before fixing anything else, and hid the rep-only fields anyway (a test covers the spoofing case the user
    asked for: `participationSource: "rep"` is stripped and saved as the employee's).
  - Run 2 (paid tier): the logs showed the real cause. Gemini **guessed field names** in the `updates: [{field}]`
    list (`pensionRate`, `currentOption`, `eligibilityGroup`). Six cases also failed on 503 "high demand". A7
    passed: Gemini accepted the merged history and did not ask about participation again.
  - Fixes, test first: a flat updateProfile (named properties), and one retry on 503. Re-run of the 8: 6 pass;
    E-003 and E-006 still called updateProfile twice, because Gemini dropped the gender form of the occupation
    ("מפתח תוכנה").
  - Fix: occupation and group enums built from the data files (no fuzzy matching: that would be guessing).
    Re-run of E-003 and E-006: both pass with one updateProfile call.
  - Result: all 9 cases pass, across runs. A clean single full run is still worth doing before ticking M3.
- **Tests first:**
  - step −1 schemas: 7 red;
  - flat schema + 503 retry: 8 red (one new test passed for the wrong reason: the old schema rejected anything
    without `updates`);
  - enums: 2 red;
  - explanations: 17 red;
  - profile and options services: 16 red;
  - e2e profile spec: 5 red (the explanation test already passed after part A).
  Then green: 368 unit, 18 e2e, typecheck, lint.
- **Contract changes (no expected values touched):** the mock model and two run-turn tests now script the flat
  updateProfile shape; `FIELD_LABELS` moved to `lib/format/labels.ts`.
- **What went wrong:**
  - `next dev` listens on all interfaces by default, so my manual-check server (and `npm run dev`, and the e2e
    server) were reachable from the LAN. The user noticed. Stopping the background task killed only npm, and the
    Node server kept running; I said it was fixed before checking, which was wrong. I found it when the restart
    failed, then stopped it by PID and checked the port. Now `--hostname 127.0.0.1` for dev and e2e, and
    `baseURL` uses 127.0.0.1 (localhost may resolve to ::1).
  - I misread "plan mode" as "lan mode", which is what led to finding the LAN exposure.
  - A heredoc Python edit wrote literal backspace bytes into a regex (`\b`). Caught with `od -c`, fixed, and
    the repo scanned for control characters. Escape-heavy edits now go through Edit or a script file.
  - The profile panel was remounted by `key` when the post-turn refetch landed, which wiped an unsaved edit. An
    e2e test caught it once the timing shifted. Fix: no remount; new server values update untouched fields only.
- **Decisions:**
  - Explanations are built in code from display values.
  - Rep-confirmed fields are locked in the form.
  - The rep's "effective from" date is deferred to the pilot (no rule uses time).
  - The thoughtSignature warning is harmless for now (TECH-DESIGN §7b).
  - M6 stays unticked until the user's test round.
### M3 ticked — clean full live eval run (19/10/2026)
- One run of all 9 cases on the final M6 code (`npm run eval:agent`, Gemini paid tier): **9/9 pass**, with no tool
  errors, no 503 retries, and every turn passing the guard.
- E-001 to E-006: every case called updateProfile exactly once and hit the sheet's net and diff on the first line:
  11693 (+661), 5078 (−3522), 13109 (−1938), 11900 (+1207), 17806 (+3562), 17794 (+721). Diffs are written as
  עלייה / ירידה.
- A12-a (EV3, participation unknown): net 11779, flagged as unconfirmed.
- A12-b (ID.7, not in the catalog): a catalog lookup and a search, then "not in the catalog", with no comparison
  made up.
- A7: after the rep's answer, the live turn called only compareOptions and quoted 9,927 (+606) with the rep's 350.
  It didn't ask about participation again.
- What it took: three schema fixes found by the eval logs (rep-only fields hidden, flat updateProfile,
  occupation / group enums from the data) and one retry on 503. See the M6 entry.
- Full table and log: [docs/evals/2026-10-19-full-run.md](evals/2026-10-19-full-run.md).
### M7 — Deploy, model fallback, security, CI (19/10/2026, code; deploy pending)
- **How:** plan mode. Every open M7 item in TECH-DESIGN §10 got a disposition (fix / mitigate / document) with a
  reason. Three questions to the user: owner cookie vs. link-as-secret, shared access code vs. magic link, same vs.
  second Supabase project for CI e2e (owner cookie, access code, same project). The user approved with one change:
  judges at the venue share one Wi-Fi IP, so per-IP limits are loose (chat 60/min, 600/h; others ×6) and the real
  guard is per conversation + a global daily cap; rep login stays 5 / 15 min. Mid-turn the user added: note the
  magic link as the pilot step, and the Supabase region (eu-central-1 → Vercel `fra1`).
- **Probe before planning:** `api.anthropic.com` answered 401 without a key, so NetFree didn't block it on 19/10; the
  Haiku evals can run locally, with the `eval-agent` workflow (`provider: anthropic`) as backup.
- **Tests first:** **56 unit red** (10 files) + **4 e2e red** (`security.spec.ts`) against throwing stubs. Three new
  tests passed early: "createFallbackOnlyModel needs the Anthropic key" passed **for the wrong reason** (the stub
  threw); rechecked after implementing (now `fallbackEnv()` rejects the empty key). "Fallback is optional" and
  "ModelBusyError keeps the cause" lock in existing / trivial behaviour.
- **Contract changes in existing tests (no expected values touched):** `handleChatTurn` and the direct actions take a
  required `ownerHash`; `createMemoryNotifier(secret)` and `conversationTopic(id, secret)` (the topic is an HMAC now);
  `rep.spec.ts` logs in and calls the rep API through the browser context; the evals choose a provider.
- **Verification:** 425 unit, typecheck, lint, 22 e2e (twice), `npm run build` + `check:build` (the prompt is in the
  chat route's trace), the Vercel env guard refusing a mock / keyless env. Migration `0004_m7_security` via MCP, then
  `list_tables`, `get_advisors security` (only INFO "RLS enabled, no policy" on the private tables: intended),
  `execute_sql` (the function allows, then denies with `retry_after`; only `service_role` may execute it), and
  `check:db` (publishable key: 0 rows on six tables, function refused, `value_of_use` readable, 20 cars match).
- **What went wrong:**
  - Mixed line endings (`core.autocrlf=true`): my first scripted edit didn't match CRLF files. The edit script now
    normalizes to LF (git stores LF anyway). Two JSON edit files broke on regex escapes; I switched those edits to
    the Edit tool and to Playwright glob strings.
  - `/rep` logged "Date.now() while prerendering": `cookies()` alone wasn't enough with `partialPrefetching`.
    `await connection()` first (an auth-gated page shouldn't be prefetched anyway).
  - Two e2e tests timed out under parallel load. Run alone they passed. I measured before changing anything: one
    rate-limit RPC is ~250 ms from here to Frankfurt (4 in parallel: ~330 ms). Fixes: `enforceLimits` now counts
    all of a request's buckets in one parallel round trip (the chat route had four sequential ones), which changed
    one test I had written this session ("stops at the first hit" → "one round trip, longest wait"); and the e2e
    per-test timeout went from 30 to 60 s. On Vercel fra1 the round trip is a few ms.
  - An unscaled rep-login limit (5 / 15 min) would have locked out the e2e suite (~6 logins from 127.0.0.1 per run,
    buckets persist in the DB). Caught before running it; the e2e scale applies there too, production stays at 5.
- **Decisions:**
  - Fallback = a `wrapGenerate` middleware: one retry, then the fallback for the rest of the turn; `busy` when
    both are busy or the 100 s budget runs out. Haiku runs with thinking disabled (history drops reasoning parts;
    latency).
  - Owner cookie: 404 (not 403) for someone else's conversation, so existence isn't confirmed; pre-M7 rows open
    for nobody.
  - Rate limits in Postgres (no new service), fail open, one round trip per request.
  - Topics: HMAC of the id, given only to the owner; channels stay public until Supabase Auth (pilot).
  - The deployed Playwright suite is separate (`*.deployed.spec.ts`): the mock-scripted specs can't run against the
    live model. It deletes what it created by id.
  - `.env.local` got generated `APP_SECRET` / `REP_ACCESS_CODE` for local dev (append only).
- **Commits:** the plan listed nine; there are six. Owner cookie, rep code, rate limits and the RLS change share
  the routes and one migration, so they are one commit. The fallback commit needed six files that also carry
  security changes; without `git add -p`, I backed up the final files, built fallback-only versions from HEAD,
  staged them, and checked the staged state alone (other work stashed): typecheck, lint, 387 unit. The security
  commit was checked the same way (420 unit), then the final files were restored and compared byte for byte.
  Restored LF files showed as modified under `core.autocrlf` with an empty `git diff`; re-adding them stored nothing.
### M7 — Configurable fallback model + fallback evals (20/10/2026)
- **Why:** no Anthropic key for now. The user asked for a second Gemini model (Flash-Lite) as the fallback on the
  same Google key, keeping the Haiku path for later.
- **How:** listed the models the key can use (Google models API) instead of guessing an id; `gemini-3.5-flash-lite`
  exists and is the primary's generation. `fallbackConfig` picks the provider from the `FALLBACK_MODEL` prefix;
  refuses a missing key, an unknown prefix or the primary itself, also at Vercel build time. Evals: `EVAL_TARGET`
  replaces yesterday's unpushed `EVAL_PROVIDER`.
- **Tests first:** 6 red (fallbackConfig cases, a Google fallback model without an Anthropic key, the deploy check),
  then 431 unit green, typecheck, lint.
- **Evals on the fallback alone:** 7/9 in two runs, identical. All numbers correct; E-005 split updateProfile; A7
  answered from history with no tool call and was blocked by the guard. The first run's log showed only failing
  cases (Vitest hides passing tests' stdout by default now), so the logged run uses `--silent=false`. I did not
  change the prompt: that affects the tuned primary, and it is the user's call.
