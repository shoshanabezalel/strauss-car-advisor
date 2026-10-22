import { CircleAlert, CircleCheck, CircleQuestionMark, Send, ShieldQuestionMark } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Notice } from "@/lib/agent";
import { FIELD_LABELS, REP_FIELD_DONE_LABELS } from "./labels";

/** What has been settled since a notice was shown: answered questions, rep-confirmed cars. */
export interface Resolved {
  questions: ReadonlySet<string>;
  cars: ReadonlySet<string>;
}

const NOTHING_RESOLVED: Resolved = { questions: new Set(), cars: new Set() };

/** Structured notices from the server (derived in code from tool outputs), never parsed from the reply text. */
export function Notices({ notices, carLabels, resolved = NOTHING_RESOLVED }: { notices: Notice[]; carLabels: Record<string, string>; resolved?: Resolved }) {
  if (!notices.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {notices.map((n, i) => (
        <NoticeAlert key={`${n.kind}-${i}`} notice={n} carLabels={carLabels} resolved={resolved} />
      ))}
    </div>
  );
}

function ResolvedAlert({ kind, title, children }: { kind: string; title: string; children: React.ReactNode }) {
  return (
    <Alert data-testid={`notice-${kind}`} data-resolved="true" className="opacity-80">
      <CircleCheck className="text-brand-green-ink" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function NoticeAlert({ notice: n, carLabels, resolved }: { notice: Notice; carLabels: Record<string, string>; resolved: Resolved }) {
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
      if (resolved.cars.has(n.carId)) {
        return (
          <ResolvedAlert kind={n.kind} title="ההשתתפות העצמית אושרה">
            צוות הרכב אישר את ההשתתפות ב-{carLabels[n.carId] ?? n.carId}. ההשוואה עודכנה.
          </ResolvedAlert>
        );
      }
      return (
        <Alert data-testid="notice-participation_unconfirmed">
          <CircleAlert />
          <AlertTitle>ההשתתפות העצמית טרם אושרה</AlertTitle>
          <AlertDescription>
            ההשתתפות ב-{carLabels[n.carId] ?? n.carId} היא ברירת המחדל מהקטלוג. הנטו עשוי להשתנות אחרי אישור של צוות הרכב.
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
      if (resolved.questions.has(n.questionId)) {
        return (
          <ResolvedAlert kind={n.kind} title="צוות הרכב ענה">
            התשובה התקבלה וההשוואה עודכנה.
          </ResolvedAlert>
        );
      }
      return (
        <Alert data-testid="notice-rep_question_open">
          <Send />
          <AlertTitle>השאלה הועברה לצוות הרכב</AlertTitle>
          <AlertDescription>ההשוואה תתעדכן כשתגיע תשובה.</AlertDescription>
        </Alert>
      );
    case "rep_answered":
      return (
        <Alert data-testid="notice-rep_answered">
          <CircleCheck className="text-brand-green-ink" />
          <AlertTitle>תשובה מצוות הרכב</AlertTitle>
          <AlertDescription>{REP_FIELD_DONE_LABELS[n.field]}. החישוב נעשה מחדש לפי כללי החברה.</AlertDescription>
        </Alert>
      );
  }
}
