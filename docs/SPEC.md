# SPEC — Strauss Car Advisor

## Goal
An employee entitled to a company car asks: "If I switch to an EV / take a different car / waive the car — how will my net salary change?"
The bot answers in Hebrew within a minute, with a clear, explained comparison. When data is missing it asks the employee or sends a question to a representative — it never guesses.

## Users
| User | What they do |
|---|---|
| Employee | Chats with the bot, enters/corrects data, sees a comparison table, changes car and recalculates |
| Transport representative | Sees open questions, answers; the employee's conversation resumes from the same point |

## Functional requirements
### Employee screen
- F1 Hebrew conversation that starts from salary, components and deductions; asks only for what is missing.
- F2 Required data: eligibility group / occupation, base salary, commissions, bonus, pension %, study fund (keren hishtalmut) %, tax credit points, number of children under 23, current situation (car + participation / waiver + maintenance allowance), requested alternative.
- F3 Show the relevant car catalog (own group and lower, + family track if eligible).
- F4 Comparison view, per option: car or waiver, eligible and why, cost and budget, participations, value-of-use (shovi shimush), EV refund or maintenance allowance, estimated net, difference vs. today, and a plain-Hebrew explanation: one line per changed component with its effect on the net, the lines adding up exactly to the difference (decided 21/10).
- F5 Data correction (profile form next to the chat) and car change → recalculation.
- F6 Payslip upload (reinstated 21/10) → read base salary, commissions, bonus, pension %, study fund % and credit points; the employee confirms or edits each one before anything is saved. Unclear values are left empty, never guessed. The file is not stored.

### Agent
- F7 Tools: get catalog, check eligibility, get value-of-use, compute comparison, ask representative, update profile.
- F8 When a value the employee cannot know is missing → question to representative + show partial comparison ("the option will update when the answer arrives").

### Representative screen
- F9 List of open questions with context (who, what is missing, which option).
- F10 Answer → the employee's conversation updates and resumes automatically.
- F11 State persisted in DB: refreshing either page loses nothing.

### Engine and rules
- F12 Calculation engine in code, reading a config (rules.json + catalog + occupations). Budgets/amounts can change without code changes.

## Business rules (from strauss-rules.json)
- Monthly car budget by group: א 3,500 · ב 3,700 · ג 4,500 · ד 5,200 ILS.
- Choose from own group or lower only.
- Large-family track: 4+ children under 23 → family car; gap above budget: 50% employee (net deduction), 50% employer.
- EV: exactly +250 ILS net (grossed-up taxable component).
- Waiver: only if the occupation allows; maintenance allowance per occupations table; taxable, not pensionable.
- Unused budget is not paid out.
- Mandatory-car roles (field roles) — no waiver.

## Non-functional requirements
- Determinism: same data + same rules = same result.
- No number in a bot reply that did not come from a tool result.
- Full Hebrew RTL UI, understandable at a glance.
- Response time: a few seconds.
- Privacy: mock data only; keys in .env.local (template: .env.example).
- Security (demo): no login — conversation id in the URL. RLS on every table; the browser key can only read, all writes go through server routes. Tighten RLS before the public deploy (M7).

## Acceptance scenarios
- A1–A6: the six sample employees — net today, net in alternative and EV gross-up match the "חישובים" sheet (rounded to shekel).
- A7: the challenge script (group ג, 14,200 base, 1,000 commissions, pension 6%, study fund 2.5%, 2.25 points, switch to EV) — including a representative question about participation and resumption after the answer.
- A8: group ב employee whose occupation allows waiver → maintenance 1,500.
- A9: field sales rep asks to waive → "not eligible: mandatory car", with explanation.
- A10: group ג employee requests a group ד car → not eligible, offer group ג-and-lower alternatives.
- A11: employee with 3 children requests Carnival → not eligible for family track.
- A12: employee doesn't know participation / car not in catalog → representative question, no invented number.
- A13: page refresh while waiting for representative → state preserved.
- A14: payslip upload → confirm card with the six values (an unreadable one shows "לא זוהה — יש למלא") → save fills the profile; a file that is not a payslip → a clear message and nothing filled.

## Deliverables
Working app (employee screen, representative screen, comparison) · source code · README with run instructions · sample config without secrets · summary: what works, limitations, what a pilot needs.
