"use client";

import { Check, LoaderCircle, Send, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AgentEvent, ToolName } from "@/lib/agent";
import type { DemoPrompt } from "@/lib/agent/mock-model";
import type { ComparisonView } from "@/lib/chat/comparison-view";
import type { ChatEvent } from "@/lib/chat/handle-turn";
import type { VisibleMessage } from "@/lib/chat/history";
import { createNdjsonParser } from "@/lib/chat/ndjson";
import { Comparison } from "./comparison";
import { STATUS_LABELS, TOOL_LABELS } from "./labels";
import { Notices } from "./notices";

interface Props {
  mock: boolean;
  demoPrompts: DemoPrompt[];
  carLabels: Record<string, string>;
}

type Status = Extract<AgentEvent, { type: "status" }>["status"];
interface Progress {
  status?: Status;
  tools: { name: ToolName; state: "running" | "done" | "error" }[];
}

const GENERIC_ERROR = "לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.";

export function EmployeeChat({ mock, demoPrompts, carLabels }: Props) {
  const params = useSearchParams();
  const [conversationId, setConversationId] = useState<string | undefined>(params.get("c") ?? undefined);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [comparison, setComparison] = useState<ComparisonView | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(Boolean(params.get("c")));
  const endRef = useRef<HTMLDivElement>(null);
  const pending = progress !== null;

  // Reload: restore the conversation from the DB.
  useEffect(() => {
    const c = params.get("c");
    if (!c) return;
    let cancelled = false;
    fetch(`/api/conversation?c=${encodeURIComponent(c)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("לא מצאתי את השיחה הזו. אפשר להתחיל שיחה חדשה.");
          setConversationId(undefined);
          return;
        }
        const data = (await res.json()) as { messages: VisibleMessage[]; comparison: ComparisonView | null };
        setMessages(data.messages);
        setComparison(data.comparison);
      })
      .catch(() => !cancelled && setError(GENERIC_ERROR))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Only on first load; later turns update state from the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setMessages((m) => [...m, { role: "assistant", text: e.reply, notices: e.notices, blocked: e.blocked }]);
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

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setProgress({ tools: [] });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, text: trimmed }),
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const parser = createNdjsonParser<ChatEvent>(onEvent);
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
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">יועץ הרכב</h1>
          <p className="text-sm text-muted-foreground">מה יקרה לנטו שלי אם אחליף רכב, אעבור לחשמלי או אוותר על הרכב?</p>
        </div>
        {mock && (
          <Badge variant="outline" data-testid="mock-badge">
            מצב הדגמה
          </Badge>
        )}
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-h-[60vh] min-h-40 flex-col gap-3 overflow-y-auto" aria-live="polite" data-testid="chat-log">
            {loading && <p className="text-sm text-muted-foreground">טוען את השיחה…</p>}
            {!loading && messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                ספר/י לי על השכר, ההפרשות והרכב שיש לך היום, ומה היית רוצה לבדוק.
              </p>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} message={m} carLabels={carLabels} />
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
              placeholder="כתב/י הודעה…"
              aria-label="הודעה"
              rows={2}
              disabled={pending}
            />
            <Button type="submit" disabled={pending || !draft.trim()} aria-label="שליחה">
              <Send className="rtl:-scale-x-100" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {comparison && <Comparison view={comparison} />}
    </div>
  );
}

function Bubble({ message: m, carLabels }: { message: VisibleMessage; carLabels: Record<string, string> }) {
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
      <Notices notices={m.notices ?? []} carLabels={carLabels} />
    </div>
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
