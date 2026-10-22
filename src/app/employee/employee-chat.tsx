"use client";

import { Check, LoaderCircle, Menu, Send, X } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AssistantAvatar, UserAvatar } from "./avatars";
import { Comparison, ExplainPanel } from "./comparison";
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
  /** Phones: "הפרטים שלי" opens as a drawer from the ☰ button; from lg up it is the sidebar. */
  const [drawer, setDrawer] = useState(false);
  /** "איך זה מחושב?" panel: the option whose lines it shows. */
  const [explain, setExplain] = useState<string | null>(null);
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

  // The comparison sits after the reply that carried it (the last one with a breakdown), else after the last message.
  const anchor = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].breakdown) return i;
    return messages.length - 1;
  }, [messages]);

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4" data-realtime={conversationId ? realtime : undefined}>
      <header className="flex items-center justify-between gap-2 rounded-2xl bg-card p-3 shadow-sm" data-tour="welcome">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="הפרטים שלי"
            aria-expanded={drawer}
            aria-controls="profile-drawer"
            onClick={() => setDrawer(true)}
            data-testid="profile-toggle"
          >
            <Menu />
          </Button>
          <AssistantAvatar size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">יועץ הרכב</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">כמה אקבל בחודש אם אחליף רכב, אעבור לחשמלי או אוותר על הרכב?</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mock && (
            <Badge variant="outline" data-testid="mock-badge">
              מצב הדגמה
            </Badge>
          )}
          <TourHelpButton onClick={tour.start} />
          <Image src="/brand/strauss-logo.png" alt="שטראוס" width={48} height={36} priority unoptimized className="hidden sm:block" />
        </div>
      </header>

      <RepStatus questions={repQuestions} carLabels={carLabels} />

      <PayslipFlow payslip={payslip} conversationId={conversationId} disabled={pending} onSaved={onDirectChange} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        {drawer && <div className="fixed inset-0 z-40 bg-foreground/30 lg:hidden" aria-hidden onClick={() => setDrawer(false)} />}
        <aside
          id="profile-drawer"
          className={
            drawer
              ? "fixed inset-y-0 start-0 z-50 flex w-[min(22rem,88vw)] flex-col gap-2 overflow-y-auto bg-background p-3 shadow-xl lg:static lg:z-auto lg:w-auto lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none"
              : "hidden lg:block"
          }
          onKeyDown={(e) => e.key === "Escape" && setDrawer(false)}
        >
          {drawer && (
            <Button type="button" variant="ghost" size="icon" className="self-end lg:hidden" aria-label="סגירה" onClick={() => setDrawer(false)} data-testid="drawer-close">
              <X />
            </Button>
          )}
          <ProfilePanel
            profile={profile}
            conversationId={conversationId}
            disabled={pending}
            onSaved={(id) => {
              setDrawer(false);
              onDirectChange(id);
            }}
            onPayslip={payslip.pick}
          />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex max-h-[75vh] min-h-48 flex-col gap-4 overflow-y-auto" aria-live="polite" data-testid="chat-log">
              {loading && <p className="text-sm text-muted-foreground">טוען את השיחה…</p>}
              {!loading && messages.length === 0 && (
                <div className="flex items-start gap-2 self-end">
                  <p className="rounded-2xl border bg-card px-3 py-2 text-sm text-muted-foreground">
                    ספרו לי על השכר, ההפרשות והרכב שיש לכם היום, ומה תרצו לבדוק.
                  </p>
                  <AssistantAvatar />
                </div>
              )}
              {messages.map((m, i) => (
                <Fragment key={i}>
                  <Bubble message={m} carLabels={carLabels} resolved={resolved} />
                  {comparison && i === anchor && <Comparison view={comparison} onExplain={setExplain} />}
                </Fragment>
              ))}
              {comparison && anchor === -1 && <Comparison view={comparison} onExplain={setExplain} />}
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
                  <Button key={p.id} variant="outline" size="sm" className="rounded-full" disabled={pending} onClick={() => send(p.text)} data-testid={`demo-${p.id}`}>
                    {p.label}
                  </Button>
                ))}
              </div>
            )}

            <form
              className="flex items-center gap-1 rounded-full border border-input bg-card p-1 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <PayslipButton variant="icon" disabled={payslipBusy} onClick={payslip.pick} />
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
                rows={1}
                className="max-h-32 min-h-11 resize-none border-0 bg-transparent px-2 py-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
                disabled={pending}
              />
              <Button type="submit" size="icon" className="rounded-full" disabled={pending || !draft.trim()} aria-label="שליחה">
                <Send className="rtl:-scale-x-100" />
              </Button>
            </form>
          </section>

          {conversationId && profile.missing.length === 0 && (
            <OptionPicker
              conversationId={conversationId}
              comparison={comparison}
              choices={profile.choices}
              disabled={pending}
              onChanged={() => onDirectChange(conversationId)}
            />
          )}

        </div>
      </div>
      {comparison && explain && <ExplainPanel view={comparison} selected={explain} onSelect={setExplain} onClose={() => setExplain(null)} />}
      {tour.node}
    </div>
  );
}

/** RTL: the employee's bubbles on the right with the avatar outside, the assistant's on the left. */
function Bubble({ message: m, carLabels, resolved }: { message: VisibleMessage; carLabels: Record<string, string>; resolved: Resolved }) {
  if (m.role === "user") {
    return (
      <div className="flex max-w-[85%] items-start gap-2 self-start">
        <UserAvatar />
        <div
          className="rounded-2xl rounded-ss-sm bg-[color-mix(in_oklch,var(--brand-blue),white_86%)] px-3 py-2 text-sm whitespace-pre-line"
          data-testid="msg-user"
        >
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[90%] items-start gap-2 self-end">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="rounded-2xl rounded-se-sm border bg-card px-3 py-2 text-sm whitespace-pre-line" data-testid="msg-assistant">
          {m.text}
        </div>
        <Notices notices={m.notices ?? []} carLabels={carLabels} resolved={resolved} />
      </div>
      <AssistantAvatar />
    </div>
  );
}

function ProgressView({ progress }: { progress: Progress }) {
  return (
    <div className="flex flex-col gap-2 self-end pe-10" data-testid="progress">
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
