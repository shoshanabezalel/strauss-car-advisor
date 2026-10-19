"use client";

import { Inbox, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepQuestionView } from "@/lib/chat/rep-view";
import { REP_QUEUE_TOPIC } from "@/lib/realtime/topics";
import { usePing } from "@/lib/realtime/use-ping";
import { AnswerForm } from "./answer-form";

export interface RepOptions {
  cars: { id: string; label: string; group: string }[];
  groups: string[];
  occupations: string[];
}

const time = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });
const shekel = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });

/** Open representative questions, refreshed on Realtime pings (or by the polling fallback). */
export function RepQueue({ mock, options }: { mock: boolean; options: RepOptions }) {
  const [questions, setQuestions] = useState<RepQuestionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(
    () =>
      fetch("/api/rep/questions", { cache: "no-store" })
        .then(async (res) => {
          // The session expired (12h): back to the login form.
          if (res.status === 401) return router.refresh();
          if (!res.ok) throw new Error(String(res.status));
          setQuestions(((await res.json()) as { questions: RepQuestionView[] }).questions);
          setError(null);
        })
        .catch(() => setError("לא הצלחתי לטעון את השאלות. מנסה שוב…")),
    [router],
  );

  async function logout() {
    await fetch("/api/rep/logout", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  useEffect(() => {
    void load();
  }, [load]);
  const realtime = usePing(REP_QUEUE_TOPIC, () => void load());

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6" data-realtime={realtime} data-testid="rep-queue">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">שאלות לנציג/ת הרכב</h1>
          <p className="text-sm text-muted-foreground">תשובה כאן מעדכנת את ההשוואה של העובד/ת מיד, לפי כללי החברה.</p>
        </div>
        <div className="flex items-center gap-2">
          {questions && <Badge variant="secondary" data-testid="open-count">{questions.length} פתוחות</Badge>}
          {mock && (
            <Badge variant="outline" data-testid="mock-badge">
              מצב הדגמה
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => void logout()} data-testid="rep-logout">
            <LogOut /> יציאה
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {questions === null && !error && <p className="text-sm text-muted-foreground">טוען…</p>}

      {questions?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground" data-testid="rep-empty">
          <Inbox className="size-8" />
          <p>אין כרגע שאלות פתוחות.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {questions?.map((q) => (
          <QuestionCard key={q.id} q={q} options={options} onAnswered={() => void load()} />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({ q, options, onAnswered }: { q: RepQuestionView; options: RepOptions; onAnswered: () => void }) {
  const current = q.asker.current;
  return (
    <Card data-testid="rep-question" data-question-id={q.id} data-conversation-id={q.conversationId} className="min-w-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>חסר: {q.fieldLabel}</span>
          {q.car && <Badge variant="outline">{q.car.label}</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          שיחה {q.shortId} · {time.format(new Date(q.createdAt))}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="rep-question-text">
          {q.question}
        </p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm" data-testid="rep-context">
          <dt className="text-muted-foreground">מי שואל/ת</dt>
          <dd>
            {[q.asker.occupation, q.asker.group && `קבוצת זכאות ${q.asker.group}`].filter(Boolean).join(" · ") || "עדיין לא ידוע"}
          </dd>
          <dt className="text-muted-foreground">הרכב היום</dt>
          <dd>
            {current
              ? current.kind === "waiver"
                ? current.label
                : `${current.label}${current.participation !== undefined ? ` · השתתפות ${shekel.format(current.participation)} ₪` : ""}`
              : "עדיין לא ידוע"}
          </dd>
          {q.car && (
            <>
              <dt className="text-muted-foreground">הרכב המבוקש</dt>
              <dd>
                {q.car.label} (קבוצה {q.car.group}) · ברירת מחדל בקטלוג {shekel.format(q.car.defaultParticipation)} ₪
              </dd>
            </>
          )}
        </dl>

        {q.answerable ? (
          <AnswerForm q={q} options={options} onAnswered={onAnswered} />
        ) : (
          <p className="text-sm text-muted-foreground">שאלה מגרסה קודמת: אי אפשר לענות עליה כאן.</p>
        )}
      </CardContent>
    </Card>
  );
}
