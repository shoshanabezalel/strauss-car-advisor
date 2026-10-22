"use client";

import { ArrowDown, ArrowUp, BadgeCheck, Calculator, Coins, Fuel, Leaf, Lightbulb, PlugZap, Receipt, Wallet, Wrench, X, Zap } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { ComparisonRow, ComparisonView } from "@/lib/chat/comparison-view";
import type { Drive } from "@/lib/config";
import { formatDiff, formatShekel, TRACK_LABELS } from "./labels";

/**
 * The comparison inside the chat: one card per option plus today, rendered only from the server's comparison view
 * (display values from compareOptions). Nothing here computes a number; the best option is picked by comparing them.
 */
export function Comparison({ view, onExplain }: { view: ComparisonView; onExplain: (key: string) => void }) {
  const best = bestOf(view.rows);
  const first = best ?? view.rows.find((r) => !r.isToday);
  const insight = best?.explanation[0];
  return (
    <section aria-label="השוואת אפשרויות" className="flex flex-col gap-3 tabular-nums" data-tour="comparison">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]" data-testid="comparison-cards">
        {view.rows.map((row) => (
          <OptionCard key={row.key} row={row} best={row === best} onExplain={onExplain} />
        ))}
      </div>
      {best && insight && (
        <p className="flex items-start gap-2 rounded-2xl bg-[color-mix(in_oklch,var(--brand-blue),white_90%)] px-3 py-2 text-xs" data-testid="insight">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue-ink" />
          <span>
            <span className="font-medium">{best.label}: </span>
            {insight}
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">הסכומים חודשיים ומעוגלים לשקל. הנטו הוא הערכה לפי כללי החברה וטבלאות המס.</p>
        {first && (
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onExplain(first.key)} data-testid="explain-open">
            <Calculator /> איך זה מחושב?
          </Button>
        )}
      </div>
    </section>
  );
}

/** The eligible option with the largest rise vs today, if any rises. */
function bestOf(rows: ComparisonRow[]): ComparisonRow | undefined {
  let best: ComparisonRow | undefined;
  for (const r of rows) {
    if (r.isToday || !r.eligible || r.direction !== "up" || r.amounts.diffVsToday === undefined) continue;
    if (!best || r.amounts.diffVsToday > best.amounts.diffVsToday!) best = r;
  }
  return best;
}

const DRIVE_LABELS: Record<Drive, string> = { electric: "רכב חשמלי", plugin: "רכב פלאג-אין", hybrid: "רכב היברידי", petrol: "רכב בנזין" };
const DRIVE_ICONS: Record<Drive, typeof Zap> = { electric: Zap, plugin: PlugZap, hybrid: Leaf, petrol: Fuel };

function kicker(row: ComparisonRow): string {
  if (row.isToday) return row.kind === "waiver" ? "המצב שלך כיום" : "הרכב שלך כיום";
  if (row.kind === "waiver") return "ויתור על רכב";
  return row.drive ? DRIVE_LABELS[row.drive] : "רכב אחר";
}

function OptionCard({ row, best, onExplain }: { row: ComparisonRow; best: boolean; onExplain: (key: string) => void }) {
  const Icon = row.kind === "waiver" ? Wallet : row.drive ? DRIVE_ICONS[row.drive] : Fuel;
  const tone = best
    ? "border-brand-green bg-[color-mix(in_oklch,var(--brand-green),white_90%)]"
    : row.isToday
      ? "bg-muted/60"
      : "bg-card";
  return (
    <article className={`flex flex-col gap-3 rounded-2xl border p-3 shadow-xs ${tone}`} data-testid={`card-${row.key}`} data-best={best || undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">{kicker(row)}</span>
          <span className="font-semibold">{row.label}</span>
        </div>
        <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--brand-blue),white_86%)] text-brand-blue-ink">
          <Icon className="size-4" />
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {row.kind === "car" ? (
          <>
            <Detail icon={Coins}>השתתפות עצמית {formatShekel(row.amounts.participation)}</Detail>
            <Detail icon={Receipt}>שווי שימוש {formatShekel(row.amounts.valueOfUse)}</Detail>
            {row.amounts.electricGross > 0 && <Detail icon={Zap}>החזר חשמל {formatShekel(row.amounts.electricGross)}</Detail>}
          </>
        ) : (
          <>
            <Detail icon={Wrench}>אחזקה {formatShekel(row.amounts.maintenance)}</Detail>
            <Detail icon={BadgeCheck}>{TRACK_LABELS[row.track]}</Detail>
          </>
        )}
      </ul>
      <Status row={row} />
      <div className="mt-auto flex flex-col gap-1.5 border-t pt-2">
        <span className="text-xs text-muted-foreground">נטו משוער בחודש</span>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Net row={row} />
          {!row.isToday && <Diff row={row} />}
        </div>
        {!row.isToday && (
          <button type="button" className="self-start text-xs text-brand-blue-ink underline underline-offset-4 hover:no-underline" onClick={() => onExplain(row.key)} data-testid={`explain-${row.key}`}>
            איך זה מחושב?
          </button>
        )}
      </div>
    </article>
  );
}

function Detail({ icon: Icon, children }: { icon: typeof Zap; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/** One short line: eligibility, or the participation's state. */
function Status({ row }: { row: ComparisonRow }) {
  const group = row.carGroup ? ` · קבוצה ${row.carGroup}` : "";
  if (row.isToday) return <p className="text-xs">המצב היום{group}</p>;
  if (!row.eligible) return <p className="text-xs text-brand-orange-ink">לא בזכאות: {row.reason}</p>;
  if (row.participationSource === "rep")
    return (
      <p className="text-xs text-brand-green-ink" data-testid="participation-rep">
        ההשתתפות אושרה ע״י צוות הרכב
      </p>
    );
  if (row.needsConfirmation) return <p className="text-xs text-brand-orange-ink">בזכאות · ההשתתפות טרם אושרה</p>;
  return (
    <p className="text-xs text-brand-green-ink">
      בזכאות · {TRACK_LABELS[row.track]}
      {group}
    </p>
  );
}

function Net({ row }: { row: ComparisonRow }) {
  if (row.amounts.net === undefined)
    return (
      <span className="text-sm text-muted-foreground" data-testid="net">
        חסרים נתונים
      </span>
    );
  return (
    <span className="text-2xl font-bold text-primary" data-testid="net">
      {formatShekel(row.amounts.net)}
    </span>
  );
}

function Diff({ row }: { row: ComparisonRow }) {
  if (row.amounts.diffVsToday === undefined) return null;
  const tone =
    row.direction === "up"
      ? "bg-[color-mix(in_oklch,var(--brand-green),white_85%)] text-brand-green-ink"
      : row.direction === "down"
        ? "bg-[color-mix(in_oklch,var(--brand-orange),white_85%)] text-brand-orange-ink"
        : "bg-muted text-muted-foreground";
  const Arrow = row.direction === "up" ? ArrowUp : row.direction === "down" ? ArrowDown : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`} data-testid="diff">
      {formatDiff(row.amounts.diffVsToday, row.direction)}
      {Arrow && <Arrow aria-hidden className="size-3.5" />}
    </span>
  );
}

/**
 * "איך זה מחושב?": the server's explanation lines (explain.ts) for one option and the change shown on its card.
 * A side panel on wide screens, a bottom sheet on phones.
 */
export function ExplainPanel({
  view,
  selected,
  onSelect,
  onClose,
}: {
  view: ComparisonView;
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const options = view.rows.filter((r) => !r.isToday);
  const row = options.find((r) => r.key === selected) ?? options[0];
  if (!row) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/30" aria-hidden onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="איך זה מחושב?"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-card p-4 shadow-xl md:inset-x-auto md:inset-y-0 md:end-0 md:max-h-none md:w-96 md:rounded-none md:rounded-s-2xl"
        data-testid="explain-panel"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Calculator aria-hidden className="size-4 text-brand-blue-ink" />
            איך זה מחושב?
          </h2>
          <Button type="button" variant="ghost" size="icon" aria-label="סגירה" onClick={onClose} data-testid="explain-close" autoFocus>
            <X />
          </Button>
        </div>
        {options.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {options.map((r) => (
              <Button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={r.key === row.key}
                variant={r.key === row.key ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => onSelect(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        )}
        <p className="text-sm font-medium">{row.label} לעומת היום</p>
        <div className="flex flex-col gap-2 text-sm" data-testid="explanation">
          {row.explanation.map((line, i) => (
            <p key={i} className="rounded-lg bg-muted/60 px-3 py-2">
              {line}
            </p>
          ))}
        </div>
        {row.eligible && row.amounts.diffVsToday !== undefined && (
          <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm tabular-nums">
            <span className="font-medium">סה״כ שינוי בנטו</span>
            <span className="font-semibold" data-testid="explain-total">
              {formatDiff(row.amounts.diffVsToday, row.direction)}
            </span>
          </div>
        )}
      </aside>
    </>
  );
}
