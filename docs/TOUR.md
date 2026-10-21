# Onboarding tour (approved 21/10, not implemented)

First-use tour: one tooltip bubble at a time, on the employee screen and the rep screen. Texts and steps approved
by the user on 21/10/2026.

**When:** implement on `main` only after both F6 (payslip, employee screen) and the gaps add-on (rep screen) are
merged. The tour touches both screens.

## Rules
- Hebrew, plural or neutral forms only: no "/י" or "/ת" forms ("כתבו לי", "אפשר לבחור", "צוות הרכב", "העובדים").
- Target element missing (first visit, empty queue) → the bubble shows **centered, without an arrow**, with the
  fallback text from the table. The step is never skipped.
- Selectors: prefer a `data-tour` attribute over `data-testid`, so test-id changes can't break the tour.
- Last step on both screens points at a "?" button that restarts the tour.

## Employee screen (`/employee`)

| # | Target | Selector | Bubble | If the target is missing (centered) |
|---|---|---|---|---|
| 1 | Header | add `data-tour="welcome"` | ברוכים הבאים ליועץ הרכב! כאן אפשר לבדוק מה יקרה לנטו אם מחליפים רכב, עוברים לחשמלי או מוותרים על הרכב. | |
| 2 | Chat input | add `data-tour="chat-input"` (today only `textarea[aria-label="הודעה"]`) | כתבו לי בחופשיות על השכר, ההפרשות והרכב שיש לכם היום. אם יחסר משהו, אשאל. | |
| 3 | Paperclip (F6) | `[data-tour="payslip-chat"]` | אפשר גם להעלות תלוש שכר במקום להקליד. הפרטים יוצגו לבדיקה לפני השמירה, והקובץ עצמו לא נשמר. | |
| 4 | "הפרטים שלי" | desktop `[data-testid="profile-panel"]`; mobile `[data-testid="profile-toggle"]` | כאן רואים ומתקנים את הפרטים. שדה עם מנעול כבר אושר על ידי צוות הרכב. | |
| 5 | Option picker | `[data-testid="option-picker"]` (absent on a first visit) | כאן בוחרים רכבים או ויתור על הרכב, ומשווים ביניהם. | אחרי שכל הפרטים ימולאו, יופיע מקום לבחור רכבים או ויתור ולהשוות ביניהם. |
| 6 | Comparison | add `data-tour="comparison"` on its wrapper (absent on a first visit) | כאן מופיעה ההשוואה: הנטו בכל אפשרות וההפרש מהיום, לפי כללי החברה. | בסוף תופיע השוואה: הנטו בכל אפשרות וההפרש מהיום, לפי כללי החברה. |
| 7 | "?" button | new button, `data-tour="tour-help"` | אפשר להפעיל את ההדרכה שוב מכאן. | |

## Rep screen (`/rep`)

| # | Target | Selector | Bubble | If the target is missing (centered) |
|---|---|---|---|---|
| 1 | Header | add `data-tour="rep-welcome"` | שלום! כאן עונים על שאלות של עובדים, והתשובה מעדכנת את ההשוואה שלהם מיד. | |
| 2 | "שאלות פתוחות" tab | `[data-testid="rep-tab-questions"]` | כאן מחכות השאלות שעוד לא נענו, והמספר מראה כמה פתוחות. | |
| 3 | "פערי מידע" tab | `[data-testid="rep-tab-gaps"]` | כאן מרוכז כל מה שהמערכת לא ידעה לענות עליו: רכבים שאינם בקטלוג, נתונים שהועברו לנציג ושאלות ללא מענה. אפשר לראות סיכום, לבקש ניתוח AI ולייצא לאקסל. | |
| 4 | First question card | `[data-testid="rep-question"]` (absent when the queue is empty) | כל כרטיס מציג מה חסר, את פרטי הפנייה ואת הרכב הנוכחי. | כשתגיע שאלה, היא תופיע ככרטיס עם מה שחסר, פרטי הפנייה והרכב הנוכחי. |
| 5 | First answer form | `[data-testid="answer-form"]` (absent when the queue is empty) | בוחרים תשובה מהרשימה ושולחים, וההשוואה בצד העובדים מתעדכנת מיד. | בכל כרטיס בוחרים תשובה מהרשימה ושולחים, וההשוואה בצד העובדים מתעדכנת מיד. |
| 6 | "?" button | new button, `data-tour="tour-help"` | אפשר להפעיל את ההדרכה שוב מכאן. | |

## To add before implementing
- `data-tour` attributes: `welcome`, `chat-input`, `comparison` (employee), `rep-welcome` (rep).
- The "?" button on both screens (`data-tour="tour-help"`).
- Step 4 on the employee screen picks its selector by breakpoint (the panel is collapsed on phones).
