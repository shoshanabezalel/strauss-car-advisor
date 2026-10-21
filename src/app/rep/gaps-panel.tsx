"use client";

import { Check, Download, SearchX, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GapAnalysis } from "@/lib/gaps/analysis";
import { GAP_TYPE_LABELS, gapLabel } from "@/lib/gaps/labels";
import type { GapSummary } from "@/lib/gaps/summary";
import { GAP_TYPES, type GapGroup } from "@/lib/gaps/types";

const time = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

/**
 * Information gaps log (מאגר פערי מידע, G): what the system couldn't answer from real data, grouped by type and
 * topic, so the company can complete the catalog and the rules. Counts are conversations; טופל holds until the gap
 * shows up again.
 */
export function GapsPanel() {
  const router = useRouter();
  const [groups, setGroups] = useState<GapGroup[] | null>(null);
  const [summary, setSummary] = useState<GapSummary | null>(null);
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/rep/gaps", { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 401) return router.refresh();
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { groups: GapGroup[]; summary: GapSummary };
          setGroups(data.groups);
          setSummary(data.summary);
          setError(null);
        })
        .catch(() => setError("לא הצלחתי לטעון את פערי המידע. אפשר לרענן את הדף.")),
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(g: GapGroup) {
    const key = `${g.type}|${g.topic}`;
    setSaving(key);
    try {
      const res = await fetch("/api/rep/gaps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: g.type, topic: g.topic, resolved: !g.resolved }),
      });
      if (res.status === 401) return router.refresh();
      if (!res.ok) throw new Error(String(res.status));
      await load();
    } catch {
      setError("לא הצלחתי לשמור. אפשר לנסות שוב.");
    } finally {
      setSaving(null);
    }
  }

  /** "ניתוח AI": the server sends the model the summary only, and checks every number it returns. */
  async function analyze() {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/rep/gaps/analysis", { method: "POST" });
      if (res.status === 401) return router.refresh();
      const body = (await res.json().catch(() => ({}))) as GapAnalysis & { message?: string };
      if (!res.ok) return setAnalysis({ status: "failed", message: body.message ?? "לא הצלחתי להפיק ניתוח. אפשר לנסות שוב." });
      setAnalysis(body);
    } catch {
      setAnalysis({ status: "failed", message: "לא הצלחתי להתחבר לשרת. אפשר לנסות שוב." });
    } finally {
      setAnalyzing(false);
    }
  }

  const open = groups?.filter((g) => !g.resolved).length ?? 0;

  return (
    <section className="flex flex-col gap-4" data-testid="gaps-panel" aria-label="פערי מידע">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">פערי מידע</h1>
          <p className="text-sm text-muted-foreground">מה המערכת לא יכלה לענות מנתונים אמיתיים, כדי להשלים את הקטלוג והכללים.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {groups && <Badge variant="secondary" data-testid="gaps-open-count">{open} פתוחים</Badge>}
          <Button variant="outline" size="sm" onClick={() => void analyze()} disabled={analyzing || !summary} data-testid="gaps-analyze">
            <Sparkles /> {analyzing ? "מנתח…" : "ניתוח AI"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/rep/gaps/csv" download data-testid="gaps-export">
              <Download /> ייצוא CSV
            </a>
          </Button>
        </div>
      </header>

      {summary && <SummaryCards summary={summary} />}

      {analysis && <AnalysisCard analysis={analysis} />}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {groups === null && !error && <p className="text-sm text-muted-foreground">טוען…</p>}

      {groups?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground" data-testid="gaps-empty">
          <SearchX className="size-8" />
          <p>עוד לא נרשמו פערי מידע.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {groups?.map((g) => {
          const key = `${g.type}|${g.topic}`;
          return (
            <Card
              key={key}
              data-testid="gap-group"
              data-type={g.type}
              data-topic={g.topic}
              data-resolved={String(g.resolved)}
              className={`min-w-0 ${g.resolved ? "opacity-60" : ""}`}
            >
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={g.type === "no_data" ? "destructive" : "outline"}>{GAP_TYPE_LABELS[g.type]}</Badge>
                    {g.vehicle && <span className="font-medium break-words">{g.vehicle}</span>}
                  </div>
                  <p className="text-sm break-words">{g.description}</p>
                  <p className="text-xs break-words text-muted-foreground">{gapLabel(g.type, g.topic, g.vehicle)}</p>
                </div>
                <dl className="flex shrink-0 gap-4 text-sm">
                  <div className="flex flex-col items-center">
                    <dt className="text-xs text-muted-foreground">פניות</dt>
                    <dd className="text-lg font-semibold tabular-nums" data-testid="gap-count">
                      {g.count}
                    </dd>
                  </div>
                  <div className="flex flex-col items-center">
                    <dt className="text-xs text-muted-foreground">נראה לאחרונה</dt>
                    <dd className="tabular-nums">{time.format(new Date(g.lastSeen))}</dd>
                  </div>
                </dl>
                <Button
                  variant={g.resolved ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={g.resolved}
                  disabled={saving === key}
                  onClick={() => void toggle(g)}
                  data-testid="gap-resolve"
                >
                  <Check /> {g.resolved ? "טופל" : "סמנו כטופל"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/** Totals per type, this week vs last week, top 5 topics: computed on the server, shown as is. */
function SummaryCards({ summary }: { summary: GapSummary }) {
  return (
    <div className="flex flex-col gap-3" data-testid="gaps-summary">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {GAP_TYPES.map((t) => (
          <Card key={t} className="min-w-0" size="sm">
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{GAP_TYPE_LABELS[t]}</span>
              <span className="text-2xl font-semibold tabular-nums" data-testid={`gaps-total-${t}`}>
                {summary.byType[t]}
              </span>
            </CardContent>
          </Card>
        ))}
        <Card className="min-w-0" size="sm">
          <CardContent className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{summary.windowDays} הימים האחרונים / הקודמים</span>
            <span className="text-2xl font-semibold tabular-nums" data-testid="gaps-trend">
              {summary.thisWeek} / {summary.lastWeek}
            </span>
          </CardContent>
        </Card>
      </div>
      {summary.topTopics.length > 0 && (
        <Card className="min-w-0" size="sm">
          <CardHeader>
            <CardTitle className="text-sm">הנושאים השכיחים</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm" data-testid="gaps-top">
              {summary.topTopics.map((t) => (
                <li key={`${t.type}|${t.topic}`} className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 break-words">
                    <Badge variant="outline" className="me-2">
                      {GAP_TYPE_LABELS[t.type]}
                    </Badge>
                    {t.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{t.count}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** The AI insights (numbers checked on the server against the summary), or the reason there are none. */
function AnalysisCard({ analysis }: { analysis: GapAnalysis }) {
  return (
    <Card className="min-w-0" data-testid="gaps-analysis" data-status={analysis.status}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> ניתוח AI
        </CardTitle>
      </CardHeader>
      <CardContent>
        {analysis.status === "ok" ? (
          <ul className="flex flex-col gap-3">
            {analysis.insights.map((i, n) => (
              <li key={n} className="flex flex-col gap-1 border-s-2 ps-3" data-testid="gaps-insight">
                <p className="text-sm break-words">{i.insight}</p>
                <p className="text-sm break-words text-muted-foreground">
                  <span className="font-medium text-foreground">המלצה: </span>
                  {i.action}
                </p>
                <span className="text-xs text-muted-foreground">מבוסס על {i.basedOnCount} פניות</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" data-testid="gaps-analysis-message">
            {analysis.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
