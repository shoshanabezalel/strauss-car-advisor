# Live eval run: 20/10/2026 (fallback model gemini-3.5-flash-lite)

`EVAL_TARGET=fallback FALLBACK_MODEL=gemini-3.5-flash-lite npm run eval:agent` (tests/evals/agent.eval.ts): the 9
cases on the fallback model alone, with the same tools, prompt and number-guard as production. Same Google key as
the primary, paid tier. Two full runs, same result both times: **7/9 pass**. No tool errors, no 429 / 503.

| Case | updateProfile calls | First line of the reply | Result |
|---|---|---|---|
| E-001 | 1 | 11,693 ₪, עלייה של 661 | Pass |
| E-002 | 1 | 5078 ₪, ירידה של 3522 | Pass |
| E-003 | 1 | 13109 ₪, ירידה של 1938 | Pass |
| E-004 | 1 | 11900 ₪, עלייה של 1207 | Pass |
| E-005 | **2** (profile, then `current` alone) | 17806 ₪, עלייה של 3562 | **Fail** (efficiency check only; numbers correct) |
| E-006 | 1 | 17794 ₪, עלייה של 721 | Pass |
| A12-a: EV3, participation unknown | 1 | 11779 ₪, עלייה של 747; flagged as unconfirmed | Pass |
| A12-b: ID.7, not in the catalog | 1 | "פולקסווגן ID.7 אינו מופיע בקטלוג"; no comparison made up | Pass |
| A7: turn after the rep answered | 0 | **no tool call**; the reply quoted numbers from the history, the guard rejected it twice → fixed fallback reply | **Fail** (blocked, nothing wrong shown) |

Compared with the primary (`gemini-3.5-flash`, 9/9 on 19/10):
- Every net and diff it showed matches the sheet; the guard never let an untraceable number through.
- E-005: it saved the current car in a second updateProfile call (no rejected call). Same symptom Gemini Flash had
  before the flat schema; costs one extra step, not correctness.
- A7: it answered "what is my net now" from the conversation instead of calling compareOptions again. The guard
  only accepts numbers from this turn's tool outputs, so it blocked the reply: the employee gets the fixed
  "couldn't phrase an accurate answer" message. Safe, but a failed turn. Not fixed here: a prompt change was not
  in scope (see AI-PROCESS).

Sample data is fictional. AI SDK `thoughtSignature` warnings were filtered from the log (harmless, TECH-DESIGN §7b).

## Log (run 2)

```text

 RUN  v5.0.5 C:/Projects/hackathon/strauss

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-001: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-10"}]}
הנטו החדש שלך יהיה 11,693 ₪, המהווה עלייה של 661 ₪ בהשוואה להיום.
השינוי נובע מירידה בשווי שימוש ומהוספת החזר חשמל (מגולם).

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-002: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"נציג/ת מכירות שטח","group":"ב","baseSalary":9800,"commissions":2400,"bonus":0,"pensionPct":6,"studyFundPct":0,"creditPoints":2.25,"childrenUnder23":5,"current":{"kind":"car","carId":"CAR-05","participation":250}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-19"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-19"}]}
הנטו החדש יהיה 5078 ₪ והוא משקף ירידה של 3522 ₪ לעומת היום.
הסיבה המרכזית היא עליית שווי שימוש ל-8120 ₪ והשתתפות עצמית של 500 ₪ במסלול קרניבל.
כמו כן, ישנה השתתפות בעלות מעל התקציב בסך 1150 ₪ (50% עובד).

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-003: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מפתח/ת תוכנה","group":"ב","baseSalary":21000,"commissions":0,"bonus":0,"pensionPct":6.5,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":0,"current":{"kind":"waiver"}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-06"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-06"}]}
הנטו שלך יהיה 13109 ₪, ירידה של 1938 ₪ לעומת המצב היום.

השינוי נובע מכך שנוספו שווי שימוש והשתתפות עצמית עבור הרכב, ובמקביל הפסקת קבלת דמי אחזקת הרכב.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-004: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת אזור מכירות","group":"ג","baseSalary":16000,"commissions":3000,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.25,"childrenUnder23":3,"current":{"kind":"car","carId":"CAR-12","participation":400}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-11"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-11"}]}
הנטו החדש יהיה 11900 ₪, ויעקוף את המצב היום בעלייה של 1207 ₪.
השינוי נובע מירידת שווי השימוש מ-4790 ₪ ל-2930 ₪, ומהפחתת ההשתתפות העצמית מ-400 ₪ ל-300 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-005: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,updateProfile,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת פיתוח","group":"ג","baseSalary":27000,"commissions":0,"bonus":0,"pensionPct":7,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":1}}
  updateProfile {"source":"employee","profile":{"current":{"kind":"car","carId":"CAR-13","participation":350}}}
  compareOptions {"options":[{"kind":"waiver"}]}
הנטו שלך יהיה 17806 ₪, המהווה עלייה של 3562 ₪ בהשוואה להיום.
זה קורה משום שביטול הרכב מבטל את שווי השימוש וההשתתפות העצמית, ובמקביל נוספת קצבת אחזקת רכב.

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-006: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מחלקה","group":"ד","baseSalary":32000,"commissions":0,"bonus":2000,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.25,"childrenUnder23":4,"current":{"kind":"car","carId":"CAR-15","participation":500}}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-14"}]}
הנטו שלך יהיה 17794 ₪, עלייה של 721 ₪ מהמצב היום.
השינוי נובע מירידה בשווי שימוש ותוספת החזר חשמל (מגולם).

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > A12: unknown participation for a new car → flagged or sent to the representative, no invented number
[eval] turn 1: tools=getCatalog,updateProfile,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-11"}]}
הנטו החדש שלך יהיה 11779 ₪, המהווה עלייה של 747 ₪ בהשוואה להיום.
השינוי נובע מירידה בשווי שימוש ובגלל החזר חשמל (מגולם).

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > A7: after the rep confirmed the participation, the live model continues without asking again
[eval] A7 live turn: tools= errors= blocked=true
סליחה, לא הצלחתי לנסח תשובה מדויקת הפעם. אפשר לשאול שוב, או שאעביר את השאלה לנציג/ת הרכב.

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > A12: a car outside the catalog → lookup or representative, never a made-up comparison
[eval] turn 1: tools=getCatalog,updateProfile,searchValueOfUse guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  searchValueOfUse {"query":"פולקסווגן ID.7"}
פולקסווגן ID.7 אינו מופיע בקטלוג הרכבים שלנו. האם תרצה/י לבחור רכב אחר מתוך הקטלוג הזמין?

 ❯ tests/evals/agent.eval.ts (9 tests | 2 failed) 40404ms
   ❯ agent evals (live model: fallback gemini-3.5-flash-lite) (9)
     × E-005: reaches the sheet's net via chat, with no invented numbers 3572ms
     × A7: after the rep confirmed the participation, the live model continues without asking again 2300ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > E-005: reaches the sheet's net via chat, with no invented numbers
AssertionError: getCatalog,updateProfile,updateProfile,compareOptions: expected [ 'updateProfile', 'updateProfile' ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ tests/evals/agent.eval.ts:98:77
     96|       expect(called).toContain("compareOptions");
     97|       // Efficiency (prompt): the full profile goes in one updateProfi…
     98|       expect(called.filter((n) => n === "updateProfile"), called.join(…
       |                                                                             ^
     99|       expect(called.filter((n) => n === "getCatalog").length, called.j…
    100|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.5-flash-lite) > A7: after the rep confirmed the participation, the live model continues without asking again
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/evals/agent.eval.ts:158:28
    156|     console.log(`[eval] A7 live turn: tools=${tools.join(",")} errors=…
    157|
    158|     expect(result.blocked).toBe(false);
       |                            ^
    159|     expect(tools).not.toContain("askRepresentative");
    160|     expect(result.notices.some((n) => n.kind === "participation_unconf…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
   Start at  20:56:48
   Duration  41.25s (tests 98%, import 1%, transform 1%)

```
