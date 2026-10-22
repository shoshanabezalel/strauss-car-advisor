"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ComparisonView } from "@/lib/chat/comparison-view";
import type { ProfileView } from "@/lib/chat/profile-view";

const SELECT =
  "min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";
const WAIVER = "waiver";
const MAX_OPTIONS = 3;

type Option = { kind: "car"; carId: string } | { kind: "waiver" };

/**
 * The options to compare (F5): swap the car, add one (up to three), remove one. POST /api/compare recomputes.
 * Shown in a dialog (employee-chat.tsx).
 */
export function OptionPicker({
  conversationId,
  comparison,
  choices,
  disabled,
  onChanged,
}: {
  conversationId: string;
  comparison: ComparisonView | null;
  choices: ProfileView["choices"];
  disabled: boolean;
  onChanged: () => void;
}) {
  const current: (Option & { label: string })[] = (comparison?.rows ?? [])
    .filter((r) => !r.isToday)
    .map((r) => (r.kind === "waiver" ? { kind: "waiver", label: r.label } : { kind: "car", carId: r.carId!, label: r.label }));
  const [pick, setPick] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = disabled || sending;

  const toOption = (v: string): Option => (v === WAIVER ? { kind: "waiver" } : { kind: "car", carId: v });
  const same = (a: Option, b: Option) => a.kind === b.kind && (a.kind === "waiver" || (b.kind === "car" && a.carId === b.carId));

  async function send(options: Option[]) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, options }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) return setError(body.message ?? "לא הצלחתי לחשב.");
      setPick("");
      onChanged();
    } catch {
      setError("לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.");
    } finally {
      setSending(false);
    }
  }

  const plain: Option[] = current.map((o) => (o.kind === "waiver" ? { kind: "waiver" } : { kind: "car", carId: o.carId }));
  const picked = pick ? toOption(pick) : undefined;
  const canAdd = picked && current.length < MAX_OPTIONS && !plain.some((o) => same(o, picked));

  return (
    <section aria-label="בחירת אפשרויות להשוואה" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">משווים:</span>
        {current.length === 0 && <span className="text-muted-foreground">עדיין לא נבחרה אפשרות</span>}
        {current.map((o, i) => (
          <Badge key={`${o.kind}-${i}`} variant="outline" className="gap-1" data-testid={`option-chip-${i}`}>
            {o.label}
            {current.length > 1 && (
              <button
                type="button"
                className="-me-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-muted"
                aria-label={`הסרת ${o.label}`}
                disabled={busy}
                onClick={() => send(plain.filter((_, j) => j !== i))}
                data-testid={`option-remove-${i}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={SELECT} value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy} aria-label="רכב או ויתור" data-testid="option-select">
          <option value="">בחירת רכב מהקטלוג המותר…</option>
          {choices.allowedCars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} (קבוצה {c.group})
            </option>
          ))}
          {choices.waiverAllowed !== false && <option value={WAIVER}>ויתור על רכב (אחזקת רכב)</option>}
        </select>
        <Button type="button" size="sm" disabled={busy || !picked} onClick={() => picked && send([picked])} data-testid="option-replace">
          {current.length ? "החלפה" : "השוואה"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !canAdd} onClick={() => picked && send([...plain, picked])} data-testid="option-add">
          הוספה
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" data-testid="option-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
