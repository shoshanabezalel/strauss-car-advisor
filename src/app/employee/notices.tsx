import { CircleAlert, CircleQuestionMark, Send, ShieldQuestionMark } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Notice } from "@/lib/agent";
import { FIELD_LABELS } from "./labels";

/** Structured notices from the server (derived in code from tool outputs), never parsed from the reply text. */
export function Notices({ notices, carLabels }: { notices: Notice[]; carLabels: Record<string, string> }) {
  if (!notices.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {notices.map((n, i) => (
        <NoticeAlert key={`${n.kind}-${i}`} notice={n} carLabels={carLabels} />
      ))}
    </div>
  );
}

function NoticeAlert({ notice: n, carLabels }: { notice: Notice; carLabels: Record<string, string> }) {
  switch (n.kind) {
    case "missing":
      return (
        <Alert data-testid="notice-missing">
          <CircleQuestionMark />
          <AlertTitle>חסרים פרטים לחישוב</AlertTitle>
          <AlertDescription>{n.fields.map((f) => FIELD_LABELS[f]).join(" · ")}</AlertDescription>
        </Alert>
      );
    case "participation_unconfirmed":
      return (
        <Alert data-testid="notice-participation_unconfirmed">
          <CircleAlert />
          <AlertTitle>ההשתתפות העצמית טרם אושרה</AlertTitle>
          <AlertDescription>
            ההשתתפות ב-{carLabels[n.carId] ?? n.carId} היא ברירת המחדל מהקטלוג. הנטו עשוי להשתנות אחרי אישור של נציג/ת הרכב.
          </AlertDescription>
        </Alert>
      );
    case "ambiguous_vou":
      return (
        <Alert data-testid="notice-ambiguous_vou">
          <ShieldQuestionMark />
          <AlertTitle>נמצאו כמה דגמים מתאימים</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {n.candidates.map((c) => (
                <li key={`${c.vehicleTypeCode}-${c.makeCode}-${c.modelCode}-${c.regYear}`}>
                  {c.tradeName || c.modelName} · {c.makeName} · שנת {c.regYear}
                </li>
              ))}
            </ul>
            צריך לבחור את הדגם הנכון לפני החישוב.
          </AlertDescription>
        </Alert>
      );
    case "confirm_vou_match":
      return (
        <Alert data-testid="notice-confirm_vou_match">
          <ShieldQuestionMark />
          <AlertTitle>צריך לאשר את הדגם</AlertTitle>
          <AlertDescription>
            נמצא: {n.record.tradeName || n.record.modelName} · {n.record.makeName} · שנת {n.record.regYear}. זה הרכב שלך?
          </AlertDescription>
        </Alert>
      );
    case "rep_question_open":
      return (
        <Alert data-testid="notice-rep_question_open">
          <Send />
          <AlertTitle>השאלה הועברה לנציג/ת הרכב</AlertTitle>
          <AlertDescription>ההשוואה תתעדכן כשתגיע תשובה.</AlertDescription>
        </Alert>
      );
  }
}
