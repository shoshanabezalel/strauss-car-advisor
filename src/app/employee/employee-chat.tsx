"use client";

import { Check, LoaderCircle, Send, X } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TourHelpButton, useTour } from "@/components/tour/tour";
import type { AgentEvent, ToolName } from "@/lib/agent";
import type { DemoPrompt } from "@/lib/agent/mock-model";
import type { ComparisonView } from "@/lib/chat/comparison-view";
import type { ConversationResponse, RepQuestionStatusView } from "@/lib/chat/conversation-response";
import type { ChatEvent } from "@/lib/chat/handle-turn";
import type { VisibleMessage } from "@/lib/chat/history";
import type { ProfileView } from "@/lib/chat/profile-view";
import { EMPLOYEE_TOUR } from "@/lib/tour/steps";
import { createNdjsonParser } from "@/lib/chat/ndjson";
import { usePing } from "@/lib/realtime/use-ping";
import { Comparison } from "./comparison";
import { STATUS_LABELS, TOOL_LABELS } from "./labels";
import { Notices, type Resolved } from "./notices";
import { OptionPicker } from "./option-picker";
import { PayslipButton, PayslipFlow, usePayslip } from "./payslip";
import { ProfilePanel } from "./profile-panel";
import { RepStatus } from "./rep-status";

interface Props {
  mock: boolean;
  demoPrompts: DemoPrompt[];
  carLabels: Record<string, string>;
  /** The form before any conversation exists (choices from the data files). */
  emptyProfile: ProfileView;
}

type Status = Extract<AgentEvent, { type: "status" }>["status"];
interface Progress {
  status?: Status;
  tools: { name: ToolName; state: "running" | "done" | "error" }[];
}

const GENERIC_ERROR = "לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.";

export function EmployeeChat({ mock, demoPrompts, carLabels, emptyProfile }: Props) {
  const params = useSearchParams();
  const [conversationId, setConversationId] = useState<string | undefined>(params.get("c") ?? undefined);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const tour = useTour("employee", EMPLOYEE_TOUR);
  const [comparison, setComparison] = useState<ComparisonView | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [repQuestions, setRepQuestions] = useState<RepQuestionStatusView[]>([]);
  const [profile, setProfile] = useState<ProfileView>(emptyProfile);
  const [loading, setLoading] = useState(Boolean(params.get("c")));
  // The Realtime topic is an HMAC of the id that only the owner gets from the API (M7), so it arrives with the first load.
  const [topic, setTopic] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const payslip = usePayslip();
  const pending = progress !== null;
  const payslipBusy = pending || payslip.state.step === "reading";
  // A ping during a running turn is applied after the turn, so the stream and the refetch don't race.
  const busy = useRef(false);
  const refetchAfterTurn = useRef(false);

  /** Restore the screen from the DB: after a reload, a Realtime ping, or a turn that opened a rep question. */
  const load = useCallback(
    (id: string, { initial = false } = {}) =>
      fetch(`/api/conversation?c=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            if (initial) {
              setError("לא מצאתי את השיחה הזו. אפשר להתחיל שיחה חדשה.");
              setConversationId(undefined);
            }
            return;
          }
          const data = (await res.json()) as ConversationResponse;
          setTopic(data.topic);
          if (busy.current) {
            refetchAfterTurn.current = true;
            return;
          }
          setMessages(data.messages);
          setComparison(data.comparison);
          setRepQuestions(data.repQuestions);
          setProfile(data.profile);
        })
        .catch(() => {
          if (initial) setError(GENERIC_ERROR);
        })
        .finally(() => {
          if (initial) setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    const c = params.get("c");
    if (c) void load(c, { initial: true });
    // Only on first load; later updates come from the stream and Realtime pings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const realtime = usePing(conversationId ? topic : undefined, () => {
    if (!conversationId) return;
    if (busy.current) refetchAfterTurn.current = true;
    else void load(conversationId);
  });

  // Old notices show as resolved once the representative answered / the participation was confirmed.
  const resolved = useMemo<Resolved>(
    () => ({
      questions: new Set(repQuestions.filter((q) => q.status === "answered").map((q) => q.id)),
      cars: new Set(
        (comparison?.rows ?? []).filter((r) => !r.isToday && r.participationSource === "rep" && r.carId).map((r) => r.carId!),
      ),
    }),
    [repQuestions, comparison],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, progress]);

  function onEvent(e: ChatEvent) {
    switch (e.type) {
      case "conversation":
        setConversationId(e.conversationId);
        window.history.replaceState(null, "", `?c=${e.conversationId}`);
        break;
      case "status":
        setProgress((p) => ({ tools: p?.tools ?? [], status: e.status }));
        break;
      case "tool":
        setProgress((p) => {
          const tools = [...(p?.tools ?? [])];
          const i = tools.findLastIndex((t) => t.name === e.name && t.state === "running");
          if (e.state !== "running" && i >= 0) tools[i] = { name: e.name, state: e.state };
          else tools.push({ name: e.name, state: e.state });
          return { status: p?.status, tools };
        });
        break;
      case "result":
        setMessages((m) => [...m, { role: "assistant", text: e.reply, notices: e.notices, blocked: e.blocked, breakdown: e.breakdown }]);
        if (e.comparison) setComparison(e.comparison);
        break;
      case "error":
        setError(e.message);
        if (e.error === "not_found") {
          setConversationId(undefined);
          window.history.replaceState(null, "", window.location.pathname);
        }
        break;
    }
  }

  /** After a form save or an option change: adopt the (maybe new) conversation id and refetch the screen. */
  function onDirectChange(id: string) {
    if (id !== conversationId) {
      setConversationId(id);
      window.history.replaceState(null, "", `?c=${id}`);
    }
    setError(null);
    void load(id);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setProgress({ tools: [] });
    busy.current = true;
    let id = conversationId;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, text: trimmed }),
      });
      if (res.status === 429) {
        const limited = (await res.json().catch(() => ({}))) as { message?: string };
        setError(limited.message ?? GENERIC_ERROR);
        return;
      }
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const parser = createNdjsonParser<ChatEvent>((e) => {
        if (e.type === "conversation") id = e.conversationId;
        onEvent(e);
      });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(value);
      }
      parser.flush();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      busy.current = false;
      setProgress(null);
      // Always refetch after a turn: the agent may have changed the profile, and a rep question may be open.
      refetchAfterTurn.current = false;
      if (id) void load(id);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6" data-realtime={conversationId ? realtime : undefined}>
      <header className="flex flex-wrap items-center justify-between gap-2" data-tour="welcome">
        <div className="flex items-center gap-3">
          <Image src="/brand/strauss-logo.png" alt="שטראוס" width={48} height={36} priority />
          <div>
            <h1 className="text-2xl font-semibold">יועץ הרכב</h1>
            <p className="text-sm text-muted-foreground">מה יקרה לנטו שלי אם אחליף רכב, אעבור לחשמלי או אוותר על הרכב?</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mock && (
            <Badge variant="outline" data-testid="mock-badge">
              מצב הדגמה
            </Badge>
          )}
          <TourHelpButton onClick={tour.start} />
        </div>
      </header>

      <RepStatus questions={repQuestions} carLabels={carLabels} />

      <PayslipFlow payslip={payslip} conversationId={conversationId} disabled={pending} onSaved={onDirectChange} />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card className="min-w-0">
          <CardContent className="flex flex-col gap-4">
            <div className="flex max-h-[60vh] min-h-40 flex-col gap-3 overflow-y-auto" aria-live="polite" data-testid="chat-log">
              {loading && <p className="text-sm text-muted-foreground">טוען את השיחה…</p>}
              {!loading && messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  ספרו לי על השכר, ההפרשות והרכב שיש לכם היום, ומה תרצו לבדוק.
                </p>
              )}
              {messages.map((m, i) => (
                <Bubble key={i} message={m} carLabels={carLabels} resolved={resolved} />
              ))}
              {progress && <ProgressView progress={progress} />}
              <div ref={endRef} />
            </div>

            {error && (
              <Alert variant="destructive" data-testid="chat-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {mock && demoPrompts.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="שאלות לדוגמה">
                {demoPrompts.map((p) => (
                  <Button key={p.id} variant="outline" size="sm" disabled={pending} onClick={() => send(p.text)} data-testid={`demo-${p.id}`}>
                    {p.label}
                  </Button>
                ))}
              </div>
            )}

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder="כתבו הודעה…"
                aria-label="הודעה"
                data-tour="chat-input"
                rows={2}
                disabled={pending}
              />
              <PayslipButton variant="icon" disabled={payslipBusy} onClick={payslip.pick} />
              <Button type="submit" variant="brand" disabled={pending || !draft.trim()} aria-label="שליחה">
                <Send className="rtl:-scale-x-100" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <ProfilePanel
          profile={profile}
          conversationId={conversationId}
          disabled={pending}
          onSaved={onDirectChange}
          onPayslip={payslip.pick}
        />
      </div>

      {conversationId && profile.missing.length === 0 && (
        <OptionPicker
          conversationId={conversationId}
          comparison={comparison}
          choices={profile.choices}
          disabled={pending}
          onChanged={() => onDirectChange(conversationId)}
        />
      )}

      <div aria-live="polite">{comparison && <Comparison view={comparison} />}</div>
      {tour.node}
    </div>
  );
}

function Bubble({ message: m, carLabels, resolved }: { message: VisibleMessage; carLabels: Record<string, string>; resolved: Resolved }) {
  if (m.role === "user") {
    return (
      <div className="max-w-[85%] self-start rounded-2xl bg-primary px-3 py-2 text-sm whitespace-pre-line text-primary-foreground" data-testid="msg-user">
        {m.text}
      </div>
    );
  }
  return (
    <div className="flex max-w-[90%] flex-col gap-2 self-end">
      <div className="rounded-2xl bg-muted px-3 py-2 text-sm whitespace-pre-line" data-testid="msg-assistant">
        {m.text}
      </div>
      {m.breakdown && <Breakdown breakdown={m.breakdown} />}
      <Notices notices={m.notices ?? []} carLabels={carLabels} resolved={resolved} />
    </div>
  );
}

/**
 * "איך זה מחושב?" under a reply that carried a comparison: the engine's net change per component, the same lines as
 * the table (built in code, stored with this reply). Closed by default.
 */
function Breakdown({ breakdown }: { breakdown: NonNullable<VisibleMessage["breakdown"]> }) {
  return (
    <details className="rounded-lg border px-3 py-2 text-xs" data-testid="breakdown">
      <summary className="cursor-pointer text-sm font-medium">איך זה מחושב?</summary>
      <div className="mt-2 flex flex-col gap-2">
        {breakdown.map((b) => (
          <div key={b.label} className="flex flex-col gap-0.5">
            {breakdown.length > 1 && <span className="font-medium">{b.label}</span>}
            {b.lines.map((line, i) => (
              <p key={i} className="text-muted-foreground" data-testid="breakdown-line">
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function ProgressView({ progress }: { progress: Progress }) {
  return (
    <div className="flex flex-col gap-2 self-end" data-testid="progress">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        {progress.status ? STATUS_LABELS[progress.status] : "שולח…"}
      </span>
      {progress.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {progress.tools.map((t, i) => (
            <Badge key={i} variant="secondary" data-testid={`tool-${t.name}`} data-state={t.state}>
              {t.state === "running" ? <LoaderCircle className="animate-spin" /> : t.state === "done" ? <Check /> : <X />}
              {TOOL_LABELS[t.name]}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
