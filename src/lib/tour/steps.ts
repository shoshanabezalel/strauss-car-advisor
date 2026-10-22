/**
 * Onboarding tour steps (docs/TOUR.md, texts approved 21/10). A step's selector is a data-tour attribute where the
 * doc adds one, else an existing data-testid. `fallback` is the centered text when the target is missing.
 */
export interface TourStep {
  id: string;
  /** One selector, or one per breakpoint (desktop = Tailwind lg and up). */
  selector: string | { desktop: string; mobile: string };
  text: string;
  fallback?: string;
}

const tour = (name: string) => `[data-tour="${name}"]`;
const testId = (id: string) => `[data-testid="${id}"]`;

const HELP: TourStep = { id: "help", selector: tour("tour-help"), text: "אפשר להפעיל את ההדרכה שוב מכאן." };

export const EMPLOYEE_TOUR: TourStep[] = [
  {
    id: "welcome",
    selector: tour("welcome"),
    text: "ברוכים הבאים ליועץ הרכב! כאן אפשר לבדוק כמה כסף ייכנס לכם לחשבון כל חודש אם תחליפו רכב, תעברו לחשמלי או תוותרו על הרכב.",
  },
  {
    id: "chat-input",
    selector: tour("chat-input"),
    text: "כתבו לי בחופשיות על השכר, ההפרשות והרכב שיש לכם היום. אם יחסר משהו, אשאל.",
  },
  {
    id: "payslip",
    selector: tour("payslip-chat"),
    text: "אפשר גם להעלות תלוש שכר במקום להקליד. הפרטים יוצגו לבדיקה לפני השמירה, הקובץ עצמו לא נשמר.",
  },
  {
    id: "profile",
    selector: { desktop: testId("profile-panel"), mobile: testId("profile-toggle") },
    text: "כאן רואים ומתקנים את הפרטים שלכם. שדות עם מנעול מולאו על ידי צוות הרכב, ולכן אי אפשר לשנות אותם כאן.",
  },
  {
    id: "options",
    selector: testId("option-picker"),
    text: "כאן בוחרים רכבים או ויתור על הרכב, ומשווים ביניהם.",
    fallback: "אחרי שכל הפרטים ימולאו, יופיע מקום לבחור רכבים או ויתור ולהשוות ביניהם.",
  },
  {
    id: "comparison",
    selector: tour("comparison"),
    text: "כאן תראו כמה תקבלו בכל אפשרות, ובכמה זה יותר או פחות מהיום.",
    fallback: "אחרי שתבחרו רכבים, תופיע כאן השוואה: כמה תקבלו בכל אפשרות ובכמה זה יותר או פחות מהיום.",
  },
  HELP,
];

export const REP_TOUR: TourStep[] = [
  {
    id: "welcome",
    selector: tour("rep-welcome"),
    text: "שלום! כאן עונים על שאלות של עובדים, והתשובה מעדכנת את ההשוואה שלהם מיד.",
  },
  {
    id: "questions",
    selector: testId("rep-tab-questions"),
    text: "כאן מחכות השאלות שעוד לא נענו, והמספר מראה כמה פתוחות.",
  },
  {
    id: "gaps",
    selector: testId("rep-tab-gaps"),
    text: "כאן מרוכז כל מה שהמערכת לא ידעה לענות עליו: רכבים שאינם בקטלוג, נתונים שהועברו לנציג ושאלות ללא מענה. אפשר לראות סיכום, לבקש ניתוח AI ולייצא לאקסל.",
  },
  {
    id: "question",
    selector: testId("rep-question"),
    text: "כל כרטיס מציג מה חסר, את פרטי הפנייה ואת הרכב הנוכחי.",
    fallback: "כשתגיע שאלה, היא תופיע ככרטיס עם מה שחסר, פרטי הפנייה והרכב הנוכחי.",
  },
  {
    id: "answer",
    selector: testId("answer-form"),
    text: "בוחרים תשובה מהרשימה ושולחים, וההשוואה בצד העובדים מתעדכנת מיד.",
    fallback: "בכל כרטיס בוחרים תשובה מהרשימה ושולחים, וההשוואה בצד העובדים מתעדכנת מיד.",
  },
  HELP,
];
