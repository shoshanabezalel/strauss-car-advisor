# PLAN — until submission (Thursday 22/10/2026, midnight; code freeze 21:00)

Deadline moved up from 28/10 (user, 21/10); on 22/10 moved from 19:00 to midnight, code freeze 21:00 (user). The original target dates below are kept as history; the work
after M7 is compressed into 21–22/10.

Method: milestones with exit criteria (not sprints). One Claude Code session per milestone:
Plan mode → approval → tests first → implement until green → manual check → commit → update PLAN + AI-PROCESS → /clear.

| # | Milestone | Target date | Exit criteria |
|---|---|---|---|
| M0 | Setup: repo, Next.js, Supabase, MCP (Supabase, Playwright), test hook, data/ as JSON | Sun 18/10 | `npm run dev` runs; data/*.json load and pass Zod |
| M1 | Net engine + eligibility | Sun–Mon 18–19/10 | 6 references + A8–A11 green |
| M2 | Value-of-use: CSV import + lookup | Mon 19/10 | 20 catalog cars match; ATTO 3/TANG collision handled |
| M3 | Agent: tools + prompt + number-guard | Tue–Wed 20–21/10 | Evals: E-001…E-006 reach correct net via chat; 0 invented numbers |
| M4 | **End-to-end skeleton**: employee screen (chat + comparison table) wired to DB | Wed 21/10 | Full E-001 run in the browser |
| M5 | Rep screen + Realtime + state persistence | Thu 22/10 | A7, A12, A13 pass manually |
| M6 | UX polish: editable profile, car change, explanations, RTL | Sun 25/10 | Test round with someone who hasn't seen the system |
| M7 | E2E + extended evals + Vercel deploy | Mon 26/10 | Playwright green on the public URL |
| G | **Information gaps log** (original feature): gaps logged from tools + agent, rep tab with summary, AI analysis, CSV | Wed 21/10 (core) – Thu 22/10 morning (add-on) | Gap tests green; rep tab works on the public URL |
| M8 | README, summary (works / limitations / pilot), AI-PROCESS, demo rehearsal | Thu 22/10, code freeze 21:00, submit before midnight | 3-minute timed demo |
| F6 | Payslip upload (reinstated by the user 21/10), on branch `f6-payslip` in a worktree, next to G | Wed 21/10 – Thu 22/10 | Unit + payslip e2e green; live payslip eval passes; merged after the user's approval |
| F7 | Onboarding tour (docs/TOUR.md), on branch `tour` in a worktree | Thu 22/10 | Unit green; tour e2e green once Supabase is free; merged after the user's approval |
| F8 | Constraint search (findOptions), on branch `f8-constraints` in a worktree | Thu 22/10, hard stop 19:30 | Unit, typecheck, lint green; live eval green; e2e written, run when the user says; merged after the user's approval |

The core of G gets its own push before the add-on, so production has a working feature even if the add-on
slips. No buffer: submission is 22/10 at midnight (code freeze 21:00).

## Status
- [x] M0 (17/10) · [x] M1 (18/10) · [x] M2 (18/10) · [x] M3 (code + unit tests 18/10; live evals 19/10: one clean full run, 9/9 pass, Gemini paid tier) · [x] M4 (18/10; E-001 in the browser with the mock model, live model pending network) · [x] M5 (18/10; A7, A12, A13 in the browser with the mock model, Realtime via broadcast) · [ ] M6 (code done 19/10: explanations, profile edit, car change, layout; test round pending) · [x] M7 (20/10: deployed suite 5/5 green on the public URL via GitHub Actions; code done 19/10: model fallback, owner cookie, rep access code, rate limits, RLS tightened, CI, deploy guards; fallback evals 20/10: gemini-3.5-flash-lite 7/9, gemini-2.5-flash unavailable (404), gemini-3.8-flash 9/9 twice → the default) · [x] G (21/10: core + add-on + follow-ups done, 473 unit; 22/10: deployed suite 6/6 on the public URL, gaps tab included) · [x] F6 (21/10: merged to main after the user's approval; rebased on G; 519 unit, typecheck, lint, e2e 32/32 (4 cold-start timeouts in employee.spec on the first run, green on rerun), live evals 13/13 on the primary) · [x] F7 (22/10: merged to main; tour e2e green locally; with the design pass: 586 unit, typecheck, lint, e2e 37/37 (first run: 3 cold-start failures in employee/gaps, green on rerun; after the form-button pass 37/37 on the first run), deployed 6/6) · [x] F8 (22/10: rebased on main and fast-forwarded; 608 unit, typecheck, lint, e2e 38/38 (first run: 4 timeouts in employee.spec, second run 1, third run 38/38 on the first try), live evals 16/16) · [ ] M8
