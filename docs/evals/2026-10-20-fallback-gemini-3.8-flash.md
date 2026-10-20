# Live eval runs: 20/10/2026 (fallback model gemini-3.8-flash)

`EVAL_TARGET=fallback FALLBACK_MODEL=gemini-3.8-flash npx vitest run --config vitest.evals.config.mts --silent=false`,
current prompt, same Google key. Two runs: **9/9 both times**. No tool errors, no 429 / 503, every turn passed
the number-guard.

| Case | Tools (both runs) | Result |
|---|---|---|
| E-001 … E-006 | getCatalog, updateProfile (once), checkEligibility, compareOptions | Pass, sheet's net and diff |
| A12-a: EV3, participation unknown | same | Pass, flagged as unconfirmed |
| A12-b: ID.7, not in the catalog | catalog lookups, searchValueOfUse, checkEligibility | Pass, no comparison made up |
| A7: turn after the rep answered | **compareOptions** | Pass: 9,927 ₪, עלייה של 606, with the rep's 350 |

Fallback comparison on the current prompt (20/10):

| Fallback model | Runs | Result | Run time |
|---|---|---|---|
| gemini-3.5-flash-lite | 3 | 7/9 (E-005 split save, A7 blocked) | ~38 s |
| gemini-2.5-flash | 2 | 0/9: 404, not available to new users | — |
| **gemini-3.8-flash** | 2 | **9/9** | ~195–202 s |
| (primary gemini-3.5-flash, reference) | 1 | 9/9 | ~125 s |

Decision: `gemini-3.8-flash` is the documented `FALLBACK_MODEL` (TECH-DESIGN §7d). Slower per case (~22 s) but
inside the chat route's 100 s turn budget. `npm run check:fallback` answered in 3.3 s.

Sample data is fictional. AI SDK `thoughtSignature` warnings were filtered (harmless, TECH-DESIGN §7b).

## Log: run 1

```text

 RUN  v5.0.5 C:/Projects/hackathon/strauss

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-001: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-10"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-10"}]}
הנטו החדש יהיה 11693 ₪, עלייה של 661 ₪ לעומת היום.
השינוי נובע מירידה בשווי שימוש מ-4070 ₪ ל-3130 ₪ ומתוספת החזר חשמל (מגולם) של 440 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש היא 300 ₪ כברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-002: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"נציג/ת מכירות שטח","group":"ב","baseSalary":9800,"commissions":2400,"bonus":0,"pensionPct":6,"studyFundPct":0,"creditPoints":2.25,"childrenUnder23":5,"current":{"kind":"car","carId":"CAR-05","participation":250}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-19"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-19"}]}
עם קיה CARNIVAL, שכר הנטו יהיה 5078 ₪, ירידה של 3522 ₪ לעומת היום.
השינוי נובע מעלייה בשווי שימוש מ-2950 ₪ ל-8120 ₪, עלייה בהשתתפות עצמית מ-250 ₪ ל-500 ₪, ותשלום של 1150 ₪ על פער מעל התקציב במסלול ברוכת ילדים.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-003: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מפתח/ת תוכנה","group":"ב","baseSalary":21000,"commissions":0,"bonus":0,"pensionPct":6.5,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":0,"current":{"kind":"waiver"}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-06"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-06"}]}
השכר בנטו עם MG4 יהיה 13109 ₪, ירידה של 1938 ₪ לעומת היום.
השינוי נובע מביטול אחזקת רכב בסך 1500 ₪, תוספת שווי שימוש של 2430 ₪ והשתתפות עצמית של 250 ₪, בקיזוז החזר חשמל (מגולם) של 473 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-004: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת אזור מכירות","group":"ג","baseSalary":16000,"commissions":3000,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.25,"childrenUnder23":3,"current":{"kind":"car","carId":"CAR-12","participation":400}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-11"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-11"}]}
הנטו עם קיה EV3 יהיה 11900 ₪, עלייה של 1207 ₪ לעומת היום.

השינוי נובע מירידה בשווי שימוש מ-4790 ₪ ל-2930 ₪, ירידה בהשתתפות עצמית מ-400 ₪ ל-300 ₪, ותוספת החזר חשמל (מגולם) של 440 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-005: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת פיתוח","group":"ג","baseSalary":27000,"commissions":0,"bonus":0,"pensionPct":7,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":1,"current":{"kind":"car","carId":"CAR-13","participation":350}}}
  checkEligibility {"option":{"kind":"waiver"}}
  compareOptions {"options":[{"kind":"waiver"}]}
במעבר למסלול ויתור על רכב, שכר הנטו שלך יעמוד על 17806 ₪ – עלייה של 3562 ₪ לעומת היום (העיסוק מאפשר ויתור).
השינוי נובע מקבלת אחזקת רכב בסך 2000 ₪, מביטול שווי שימוש בסך 4570 ₪ ומביטול השתתפות עצמית בסך 350 ₪.

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-006: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מחלקה","group":"ד","baseSalary":32000,"commissions":0,"bonus":2000,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.25,"childrenUnder23":4,"current":{"kind":"car","carId":"CAR-15","participation":500}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-14"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-14"}]}
הנטו החדש צפוי להיות 17794 ₪, עלייה של 721 ₪ לעומת היום.
השינוי נובע מירידה בשווי שימוש מ-5150 ₪ ל-4150 ₪, ומתוספת החזר חשמל (מגולם) בסך 473 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש (500 ₪) היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > A12: unknown participation for a new car → flagged or sent to the representative, no invented number
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-11"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-11"}]}
הנטו החדש יהיה 11779 ₪, עלייה של 747 ₪ לעומת היום.
השינוי נובע מירידה ב-שווי שימוש מ-4070 ₪ ל-2930 ₪, ומ-החזר חשמל (מגולם) של 440 ₪ ברוטו.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים (300 ₪) ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > A7: after the rep confirmed the participation, the live model continues without asking again
[eval] A7 live turn: tools=compareOptions errors= blocked=false
הנטו החדש הוא 9927 ₪, עלייה של 606 ₪ לעומת היום.
שווי השימוש יורד מ-4070 ל-3130 ₪, ומתווסף החזר חשמל מגולם של 440 ₪.
ההשתתפות העצמית עולה מ-300 ל-350 ₪.

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > A12: a car outside the catalog → lookup or representative, never a made-up comparison
[eval] turn 1: tools=getCatalog,updateProfile,getCatalog,searchValueOfUse,checkEligibility guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  getCatalog {}
  searchValueOfUse {"query":"ID.7"}
  checkEligibility {"option":{"kind":"car","carId":"CAR-10"}}
פולקסווגן ID.7 אינו מופיע בקטלוג הרכבים של החברה, ולכן לא ניתן לבחור בו.

עבור קבוצת זכאות ג', הרכבים החשמליים הזמינים לבחירה הם בי ווי די ATTO 3 וקיה EV3 (וכן דגמים חשמליים מקבוצות נמוכות יותר, כמו יונדאי KONA EV, מ.ג MG4 או בי ווי די BYD DOLPHIN).

תרצו שנבדוק את השינוי בנטו עבור אחד מהרכבים האלה?


 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  21:23:24
   Duration  194.67s (tests 100%)

```

## Log: run 2

```text

 RUN  v5.0.5 C:/Projects/hackathon/strauss

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-001: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-10"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-10"}]}
הנטו החדש יהיה 11693 ₪, עלייה של 661 ₪ לעומת היום.

ההבדל נובע מירידה בשווי שימוש מ-4070 ₪ ל-3130 ₪, ומקבלת החזר חשמל (מגולם) בסך 440 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-002: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"נציג/ת מכירות שטח","group":"ב","baseSalary":9800,"commissions":2400,"bonus":0,"pensionPct":6,"studyFundPct":0,"creditPoints":2.25,"childrenUnder23":5,"current":{"kind":"car","carId":"CAR-05","participation":250}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-19"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-19"}]}
הנטו החדש יהיה 5078 ₪, ירידה של 3522 ₪ לעומת היום.

הירידה נובעת מעליית שווי שימוש מ-2950 ₪ ל-8120 ₪, עליית השתתפות עצמית מ-250 ₪ ל-500 ₪, והשתתפות של 1150 ₪ בגין הפער מעל התקציב במסלול משפחה.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-003: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מפתח/ת תוכנה","group":"ב","baseSalary":21000,"commissions":0,"bonus":0,"pensionPct":6.5,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":0,"current":{"kind":"waiver"}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-06"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-06"}]}
הנטו החדש יהיה 13109 ₪, ירידה של 1938 ₪ לעומת היום.

השינוי נובע מהפסקת אחזקת רכב בסך 1500 ₪, זקיפת שווי שימוש של 2430 ₪ והשתתפות עצמית של 250 ₪, בקיזוז החזר חשמל (מגולם) בסך 473 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-004: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת אזור מכירות","group":"ג","baseSalary":16000,"commissions":3000,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.25,"childrenUnder23":3,"current":{"kind":"car","carId":"CAR-12","participation":400}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-11"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-11"}]}
הנטו החדש יהיה 11900 ₪, עלייה של 1207 ₪ לעומת היום.
השינוי נובע מירידה של שווי שימוש מ-4790 ₪ ל-2930 ₪, ירידה של השתתפות עצמית מ-400 ₪ ל-300 ₪, ותוספת החזר חשמל (מגולם) של 440 ₪.
הרכב זכאי לבחירה מאחר שהרכב מהקבוצה שלך או נמוכה ממנה.

שימו לב: ההשתתפות העצמית לרכב החדש היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-005: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת פיתוח","group":"ג","baseSalary":27000,"commissions":0,"bonus":0,"pensionPct":7,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":1,"current":{"kind":"car","carId":"CAR-13","participation":350}}}
  checkEligibility {"option":{"kind":"waiver"}}
  compareOptions {"options":[{"kind":"waiver"}]}
הנטו במעבר לויתור על רכב יהיה 17806 ₪, עלייה של 3562 ₪ לעומת היום.

השינוי נובע מתוספת אחזקת רכב של 2000 ₪ ומביטול השתתפות עצמית של 350 ₪.
בנוסף, שווי שימוש יורד מ-4570 ₪ ל-0 ₪.

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > E-006: reaches the sheet's net via chat, with no invented numbers
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מחלקה","group":"ד","baseSalary":32000,"commissions":0,"bonus":2000,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.25,"childrenUnder23":4,"current":{"kind":"car","carId":"CAR-15","participation":500}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-14"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-14"}]}
הנטו החדש יהיה 17794 ₪, עלייה של 721 ₪ לעומת היום.
העלייה נובעת מירידה בשווי שימוש מ-5150 ₪ ל-4150 ₪, ומתוספת החזר חשמל (מגולם) בסך 473 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש (500 ₪) היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > A12: unknown participation for a new car → flagged or sent to the representative, no invented number
[eval] turn 1: tools=getCatalog,updateProfile,checkEligibility,compareOptions guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  checkEligibility {"option":{"kind":"car","carId":"CAR-11"}}
  compareOptions {"options":[{"kind":"car","carId":"CAR-11"}]}
הקיה קוריאה EV3 מאושרת לבחירה (הרכב מהקבוצה שלך או נמוכה ממנה).

הנטו החדש יהיה 11779 ₪, עלייה של 747 ₪ לעומת היום.
השינוי נובע מירידה של שווי שימוש מ-4070 ₪ ל-2930 ₪ וקבלת החזר חשמל (מגולם) בסך 440 ₪.

שימו לב: ההשתתפות העצמית לרכב החדש (300 ₪) היא ברירת המחדל מקטלוג הרכבים ועדיין לא אושרה. לשלוח שאלה לנציג/ת הרכב כדי לאשר אותה?

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > A7: after the rep confirmed the participation, the live model continues without asking again
[eval] A7 live turn: tools=compareOptions errors= blocked=false
הנטו החדש יהיה 9927 ₪, עלייה של 606 ₪.
שווי שימוש יורד מ-4070 ל-3130 ₪.
נוסף החזר חשמל (מגולם) של 440 ₪, והשתתפות עצמית עולה מ-300 ל-350 ₪.

stdout | tests/evals/agent.eval.ts > agent evals (live model: fallback gemini-3.8-flash) > A12: a car outside the catalog → lookup or representative, never a made-up comparison
[eval] turn 1: tools=getCatalog,updateProfile,getCatalog,searchValueOfUse,checkEligibility guard=true
[eval] calls:
  getCatalog {"scope":"all"}
  updateProfile {"source":"employee","profile":{"occupation":"מנהל/ת מוצר","group":"ג","baseSalary":18500,"commissions":0,"bonus":0,"pensionPct":6,"studyFundPct":2.5,"creditPoints":2.75,"childrenUnder23":2,"current":{"kind":"car","carId":"CAR-09","participation":300}}}
  getCatalog {}
  searchValueOfUse {"query":"ID.7"}
  checkEligibility {"option":{"kind":"car","carId":"ID.7"}}
פולקסווגן ID.7 אינו קיים בקטלוג הרכבים של החברה, ולכן לא ניתן לבחור בו.

עבור קבוצת זכאות ג, עומדים לרשותך בקטלוג רכבים חשמליים כגון בי ווי די ATTO 3 וקיה קוריאה EV3 (וכן דגמים מקבוצות א' ו-ב'). האם לבדוק את השפעת המעבר על הנטו עבור אחד מהדגמים האלה, או עבור רכב אחר מהקטלוג?


 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  21:26:47
   Duration  202.18s (tests 99%)

```

