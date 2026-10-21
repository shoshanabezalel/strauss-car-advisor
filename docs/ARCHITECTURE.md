# ARCHITECTURE

## Stack
| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript | Frontend + API in one project, Vercel deploy |
| UI | Tailwind + shadcn/ui, `dir="rtl"` | Fast, looks good |
| LLM | Gemini (paid tier) via Vercel AI SDK; on 429 / 503 one retry, then Claude Haiku 5.5 with the same tools, prompt and guard | Function calling, good Hebrew; the fallback only swaps the `LanguageModel` |
| DB | Supabase (Postgres + Realtime) | Persisted state + live update when the rep answers |
| Validation | Zod | Schemas for tools, rules and profile |
| Tests | Vitest (unit) + Playwright (E2E) | |
| Hosting | Vercel (`fra1`) + Supabase free tier (eu-central-1) | Functions next to the DB |
| CI | GitHub Actions: lint, types, unit, build, e2e (mock) on every push | |

## Components
```
┌──────────── Browser ─────────────────┐
│ /employee  chat + profile + table    │   ┌──── /rep  open questions ────┐
└──────┬──────────────────▲────────────┘   └──────┬──────────────▲────────┘
       │ POST /api/chat   │ Realtime              │ POST /api/rep/answer
       ▼                  │                       ▼               │
┌──────────── Next.js API (server) ─────────────────────────────────────┐
│  Agent (AI SDK generateText + tools; NDJSON progress, guarded reply)  │
│   ├─ tools/getCatalog       ─┐                                         │
│   ├─ tools/checkEligibility  ├─► lib/engine  (pure, deterministic)     │
│   ├─ tools/getValueOfUse     │    ├─ eligibility.ts                    │
│   ├─ tools/compareOptions   ─┘    ├─ net.ts (tax, NI, health, gross-up)│
│   ├─ tools/updateProfile          └─ compare.ts                        │
│   └─ tools/askRepresentative                                           │
│  lib/config ← data/*.json (rules, catalog, occupations) + Zod          │
│  lib/vou    ← Supabase table value_of_use (from CSV)                   │
│  number-guard: every number in a reply must appear in tool results     │
└───────────────────────────────┬────────────────────────────────────────┘
                                ▼
                 Supabase: conversations, messages, profiles,
                           rep_questions, comparisons, value_of_use
```

## Main flows
1. **Chat**: employee sends a message → `POST /api/chat` loads conversation + profile from DB → LLM with tools → tools update profile / compute → number-guard → persisted. The response is an NDJSON stream: tool/status progress while the model works, then the reply, notices and comparison **once, after the guard** (reply text never streams). `AGENT_MODEL=mock` swaps in a scripted model for local dev; everything else is the same.
2. **Comparison**: `compareOptions` returns full JSON → frontend renders the table from the JSON (not from model text) → the explanation is built in code from the engine's `netDelta` (the change per component in net terms), and the model explains only with those lines.
3. **Representative**: `askRepresentative` inserts into rep_questions, conversation status `waiting_rep` → rep answers → saved as a profile fact + system message → Realtime wakes the employee screen → agent resumes automatically from the same point.
4. **Config**: all rules in data/*.json. In a pilot, swap files, not code.
5. **Information gaps (מאגר פערי מידע)**: whenever the system can't answer from real data, it is recorded: in code
   from the tools (a participation left on the catalog default, a question sent to the rep, a car outside the
   catalog), and by the agent's `logInformationGap` tool when it says it has no information. No personal data;
   company data only. The rep screen's "פערי מידע" tab groups them (count, last seen, טופל), with a summary computed
   in code, an AI analysis that reads only that summary and may cite only its numbers, and a CSV export. Strauss sees
   what the catalog and the rules are missing.

## Principles
- Strict split: **LLM = conversation and explanation**, **engine = every number**.
- Every tool input passes Zod; missing input → structured error that sends the model back to ask.
- Conversation state lives in the DB (not memory/browser) → survives refresh and serverless.
- Guard: automatic check that every number in bot text appears in tool results for that conversation; if not → regenerate.
- Access (M7): a conversation opens only in the browser that created it (httpOnly owner cookie); the rep screen needs
  a shared access code (demo scope; per-rep sign-in in the pilot); every API route is rate-limited; the browser key
  reads no conversation table (RLS, no policy).
