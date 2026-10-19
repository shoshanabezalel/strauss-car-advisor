# PLAN — until the final (Wednesday 28/10/2026)

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
| M8 | README, summary (works / limitations / pilot), AI-PROCESS, demo rehearsal | Tue 27/10 | 3-minute timed demo |
| ★ | Optional: payslip reading | if time after M7 | |

Fri–Sat 23–24/10: no work. Buffer: Mon–Tue.

## Status
- [x] M0 (17/10) · [x] M1 (18/10) · [x] M2 (18/10) · [ ] M3 (code + unit tests done 18/10; live evals 19/10: all 9 cases pass after the schema fixes, across runs — one clean full run before ticking) · [x] M4 (18/10; E-001 in the browser with the mock model, live model pending network) · [x] M5 (18/10; A7, A12, A13 in the browser with the mock model, Realtime via broadcast) · [ ] M6 (code done 19/10: explanations, profile edit, car change, layout; test round pending) · [ ] M7 · [ ] M8
