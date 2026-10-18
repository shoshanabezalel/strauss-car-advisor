import { CircleCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RepFieldSchema } from "@/lib/agent/schemas";
import type { RepQuestionStatusView } from "@/lib/chat/conversation-response";
import { REP_FIELD_ASK_LABELS } from "./labels";

/** Representative questions of this conversation and their status. Restored after a reload (A13). */
export function RepStatus({ questions, carLabels }: { questions: RepQuestionStatusView[]; carLabels: Record<string, string> }) {
  if (!questions.length) return null;
  return (
    <section aria-label="שאלות לנציג/ת הרכב" className="flex flex-col gap-2 rounded-lg border p-3" data-testid="rep-status">
      {questions.map((q) => {
        const field = RepFieldSchema.safeParse(q.field);
        const what = field.success ? REP_FIELD_ASK_LABELS[field.data] : q.field;
        const car = q.carId ? (carLabels[q.carId] ?? q.carId) : "";
        const open = q.status === "open";
        return (
          <div key={q.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="rep-status-item" data-status={q.status}>
            {open ? <Clock className="size-4 text-amber-600" /> : <CircleCheck className="size-4 text-emerald-700" />}
            <span>
              שאלה לנציג/ת הרכב: {what}
              {field.success && field.data === "participation" ? car : ""}
            </span>
            <Badge variant={open ? "outline" : "secondary"}>{open ? "ממתין/ה לתשובה" : "התקבלה תשובה"}</Badge>
          </div>
        );
      })}
    </section>
  );
}
