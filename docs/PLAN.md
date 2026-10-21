# PLAN — until submission (Thursday 22/10/2026, 19:00)

Deadline moved up from 28/10 (user, 21/10). The original target dates below are kept as history; the work
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
| M8 | README, summary (works / limitations / pilot), AI-PROCESS, demo rehearsal | Thu 22/10, before 19:00 | 3-minute timed demo |
| ★ | Optional: payslip reading | dropped (deadline) | |

The core of G gets its own push before the add-on, so production has a working feature even if the add-on
slips. No buffer: submission is 22/10 19:00.

## Status
- [x] M0 (17/10) · [x] M1 (18/10) · [x] M2 (18/10) · [x] M3 (code + unit tests 18/10; live evals 19/10: one clean full run, 9/9 pass, Gemini paid tier) · [x] M4 (18/10; E-001 in the browser with the mock model, live model pending network) · [x] M5 (18/10; A7, A12, A13 in the browser with the mock model, Realtime via broadcast) · [ ] M6 (code done 19/10: explanations, profile edit, car change, layout; test round pending) · [x] M7 (20/10: deployed suite 5/5 green on the public URL via GitHub Actions; code done 19/10: model fallback, owner cookie, rep access code, rate limits, RLS tightened, CI, deploy guards; fallback evals 20/10: gemini-3.5-flash-lite 7/9, gemini-2.5-flash unavailable (404), gemini-3.8-flash 9/9 twice → the default) · [ ] G (21/10: core + add-on + follow-ups done, 473 unit; deployed gaps test runs after the push) · [ ] M8
