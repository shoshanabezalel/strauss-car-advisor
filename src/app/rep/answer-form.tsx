"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RepAnswer } from "@/lib/agent/schemas";
import type { RepQuestionView } from "@/lib/chat/rep-view";
import type { RepOptions } from "./rep-queue";

const FIELD =
  "w-full min-w-0 min-h-11 rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

const WAIVER = "waiver";

/**
 * One form per question field. Values are typed (numbers, picks from the data lists), sent as RepAnswer; the server
 * validates the bound and applies them through the tools. Nothing typed here reaches the employee as text.
 */
export function AnswerForm({ q, options, onAnswered }: { q: RepQuestionView; options: RepOptions; onAnswered: () => void }) {
  const [amount, setAmount] = useState("");
  const [pick, setPick] = useState("");
  const [answeredBy, setAnsweredBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function build(): RepAnswer | string {
    const value = Number(amount);
    const validAmount = amount.trim() !== "" && Number.isFinite(value) && value >= 0;
    switch (q.field) {
      case "participation":
        if (!q.car) return "חסר רכב לשאלה.";
        return validAmount ? { field: "participation", carId: q.car.id, value } : "יש להזין סכום השתתפות.";
      case "current":
        if (!pick) return "יש לבחור רכב או ויתור.";
        if (pick === WAIVER) return { field: "current", situation: { kind: "waiver" } };
        return validAmount ? { field: "current", situation: { kind: "car", carId: pick, participation: value } } : "יש להזין סכום השתתפות.";
      case "group":
      case "occupation":
        return pick ? { field: q.field, value: pick } : "יש לבחור מהרשימה.";
      default:
        return "אי אפשר לענות על שאלה מהסוג הזה.";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const answer = build();
    if (typeof answer === "string") return setError(answer);
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/rep/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: q.id, answer, answeredBy: answeredBy.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? "לא הצלחתי לשמור את התשובה.");
        if (res.status === 409) onAnswered();
        return;
      }
      onAnswered();
    } catch {
      setError("לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.");
    } finally {
      setSending(false);
    }
  }

  const needsAmount = q.field === "participation" || (q.field === "current" && pick !== "" && pick !== WAIVER);
  return (
    <form className="flex flex-col gap-3" onSubmit={submit} data-testid="answer-form">
      {q.field === "current" && (
        <label className="flex flex-col gap-1 text-sm">
          הרכב הנוכחי
          <select className={FIELD} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="answer-car">
            <option value="">בחירה…</option>
            {options.cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} (קבוצה {c.group})
              </option>
            ))}
            <option value={WAIVER}>ויתור על רכב (אחזקת רכב)</option>
          </select>
        </label>
      )}
      {(q.field === "group" || q.field === "occupation") && (
        <label className="flex flex-col gap-1 text-sm">
          {q.field === "group" ? "קבוצת זכאות" : "עיסוק"}
          <select className={FIELD} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="answer-pick">
            <option value="">בחירה…</option>
            {(q.field === "group" ? options.groups : options.occupations).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {needsAmount && (
        <label className="flex flex-col gap-1 text-sm">
          השתתפות עצמית חודשית (₪)
          <input
            className={FIELD}
            type="number"
            inputMode="numeric"
            min={0}
            max={q.field === "participation" ? q.car?.maxParticipation : undefined}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={Boolean(error)}
            data-testid="answer-amount"
            dir="ltr"
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        שם (לא חובה)
        <input className={FIELD} value={answeredBy} maxLength={60} onChange={(e) => setAnsweredBy(e.target.value)} data-testid="answer-by" />
      </label>
      {error && (
        <Alert variant="destructive" data-testid="answer-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="brand" disabled={sending} data-testid="answer-submit">
        {sending ? "שומר…" : "שליחת תשובה"}
      </Button>
    </form>
  );
}
