/**
 * F6: synthetic payslips for the live payslip eval (`npx tsx scripts/make-sample-payslip.ts`).
 * Every personal detail is clearly fake. The employer's pension and study-fund rates differ from the employee's,
 * so the eval also checks the model reads the employee's share. Writes tests/fixtures/payslip/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.join(process.cwd(), "tests/fixtures/payslip");

/** What the payslip shows; the eval expects exactly these. */
export const SAMPLE = { baseSalary: 21450, commissions: 1200, bonus: 800, pensionPct: 6, studyFundPct: 2.5, creditPoints: 2.25 };

const fmt = (n: number) => n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gross = SAMPLE.baseSalary + SAMPLE.commissions + SAMPLE.bonus;

const payslip = `<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;margin:24px;width:760px;color:#111}
h1{font-size:20px;margin:0 0 4px} .demo{color:#b00;font-weight:bold}
table{border-collapse:collapse;width:100%;margin-top:12px;font-size:14px} td,th{border:1px solid #888;padding:4px 8px;text-align:right}
th{background:#eee}</style>
<h1>תלוש שכר – אוקטובר 2026</h1>
<div class="demo">דוגמה בלבד – נתונים פיקטיביים</div>
<table>
<tr><th>שם העובד</th><td>ישראל ישראלי (דוגמה)</td><th>מספר זהות</th><td>000000000</td></tr>
<tr><th>מעסיק</th><td>חברה לדוגמה בע״מ</td><th>חשבון בנק</th><td>בנק 99 סניף 999 חשבון 000000</td></tr>
<tr><th>נקודות זיכוי</th><td>${SAMPLE.creditPoints}</td><th>מצב משפחתי</th><td>נשוי/אה</td></tr>
</table>
<table>
<tr><th>תשלומים</th><th>סכום</th></tr>
<tr><td>שכר בסיס</td><td>${fmt(SAMPLE.baseSalary)}</td></tr>
<tr><td>עמלות</td><td>${fmt(SAMPLE.commissions)}</td></tr>
<tr><td>בונוס</td><td>${fmt(SAMPLE.bonus)}</td></tr>
<tr><td><b>סה״כ ברוטו</b></td><td><b>${fmt(gross)}</b></td></tr>
</table>
<table>
<tr><th>ניכויים והפרשות</th><th>עובד %</th><th>עובד ₪</th><th>מעסיק %</th><th>מעסיק ₪</th></tr>
<tr><td>קרן פנסיה</td><td>${SAMPLE.pensionPct}%</td><td>${fmt((gross * SAMPLE.pensionPct) / 100)}</td><td>6.5%</td><td>${fmt(gross * 0.065)}</td></tr>
<tr><td>קרן השתלמות</td><td>${SAMPLE.studyFundPct}%</td><td>${fmt((gross * SAMPLE.studyFundPct) / 100)}</td><td>7.5%</td><td>${fmt(gross * 0.075)}</td></tr>
<tr><td>מס הכנסה</td><td></td><td>2,104.00</td><td></td><td></td></tr>
<tr><td>ביטוח לאומי ומס בריאות</td><td></td><td>1,610.00</td><td></td><td></td></tr>
</table></html>`;

const notPayslip = `<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;margin:24px;width:520px} li{margin:6px 0}</style>
<h1>תפריט ארוחת צהריים</h1><ul><li>שקשוקה – 42 ₪</li><li>סלט ירקות – 36 ₪</li><li>קפה – 12 ₪</li></ul></html>`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 820, height: 700 } });
  await page.setContent(payslip);
  writeFileSync(path.join(OUT, "synthetic-payslip.png"), await page.screenshot({ fullPage: true }));
  writeFileSync(path.join(OUT, "synthetic-payslip.pdf"), await page.pdf({ format: "A4", printBackground: true }));
  await page.setContent(notPayslip);
  writeFileSync(path.join(OUT, "not-payslip.png"), await page.screenshot({ fullPage: true }));
  await browser.close();
  console.log(`wrote 3 files to ${path.relative(process.cwd(), OUT)}`);
}

if (process.argv[1]?.endsWith("make-sample-payslip.ts")) void main();
