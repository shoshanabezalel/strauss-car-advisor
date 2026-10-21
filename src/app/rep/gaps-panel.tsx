"use client";

import { Check, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GAP_TYPE_LABELS } from "@/lib/gaps/labels";
import type { GapGroup } from "@/lib/gaps/types";

const time = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" });

/**
 * Information gaps log (מאגר פערי מידע, G): what the system couldn't answer from real data, grouped by type and
 * topic, so the company can complete the catalog and the rules. Counts are conversations; טופל holds until the gap
 * shows up again.
 */
export function GapsPanel() {
  const router = useRouter();
  const [groups, setGroups] = useState<GapGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/rep/gaps", { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 401) return router.refresh();
          if (!res.ok) throw new Error(String(res.status));
          setGroups(((await res.json()) as { groups: GapGroup[] }).groups);
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

  const open = groups?.filter((g) => !g.resolved).length ?? 0;

  return (
    <section className="flex flex-col gap-4" data-testid="gaps-panel" aria-label="פערי מידע">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">פערי מידע</h1>
          <p className="text-sm text-muted-foreground">מה המערכת לא יכלה לענות מנתונים אמיתיים, כדי להשלים את הקטלוג והכללים.</p>
        </div>
        {groups && <Badge variant="secondary" data-testid="gaps-open-count">{open} פתוחים</Badge>}
      </header>

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
                  <p className="text-xs break-all text-muted-foreground" dir="ltr">
                    {g.topic}
                  </p>
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
