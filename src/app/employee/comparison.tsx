import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ComparisonRow, ComparisonView } from "@/lib/chat/comparison-view";
import { formatDiff, formatShekel, TRACK_LABELS } from "./labels";

/**
 * The comparison, rendered only from the server's comparison view (display values from compareOptions).
 * Table from md up, one card per option on narrow screens. Nothing here computes a number.
 */
export function Comparison({ view }: { view: ComparisonView }) {
  return (
    <section aria-label="השוואת אפשרויות" className="flex flex-col gap-3" data-tour="comparison">
      <h2 className="text-lg font-semibold">השוואה</h2>
      <ComparisonTable rows={view.rows} />
      <ComparisonCards rows={view.rows} />
      <p className="text-xs text-muted-foreground">הסכומים חודשיים ומעוגלים לשקל. הנטו הוא הערכה לפי כללי החברה וטבלאות המס.</p>
    </section>
  );
}

const money = (n: number | undefined) => (n === undefined ? "—" : formatShekel(n));

function Net({ row }: { row: ComparisonRow }) {
  if (row.amounts.net === undefined) return <span className="text-muted-foreground">חסרים נתונים</span>;
  return <span className="font-semibold">{formatShekel(row.amounts.net)}</span>;
}

function Diff({ row }: { row: ComparisonRow }) {
  if (row.isToday) return <span className="text-muted-foreground">—</span>;
  if (row.amounts.diffVsToday === undefined) return <span className="text-muted-foreground">—</span>;
  const tone = row.direction === "up" ? "text-emerald-700" : row.direction === "down" ? "text-red-700" : "";
  return <span className={`font-semibold ${tone}`}>{formatDiff(row.amounts.diffVsToday, row.direction)}</span>;
}

function Eligibility({ row }: { row: ComparisonRow }) {
  if (row.isToday) return <Badge variant="secondary">המצב היום</Badge>;
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={row.eligible ? "default" : "destructive"}>{row.eligible ? "זכאי/ת" : "לא זכאי/ת"}</Badge>
      <span className="text-xs text-muted-foreground">{row.reason}</span>
    </div>
  );
}

function Participation({ row }: { row: ComparisonRow }) {
  if (row.kind === "waiver") return <span>—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {formatShekel(row.amounts.participation)}
      {row.needsConfirmation && <Badge variant="outline">טרם אושרה</Badge>}
      {row.participationSource === "rep" && (
        <Badge variant="secondary" data-testid="participation-rep">
          אושרה ע״י נציג/ת
        </Badge>
      )}
    </span>
  );
}

function Extras({ row }: { row: ComparisonRow }) {
  const parts: string[] = [];
  if (row.amounts.electricGross) parts.push(`החזר חשמל ${formatShekel(row.amounts.electricGross)}`);
  if (row.amounts.maintenance) parts.push(`אחזקה ${formatShekel(row.amounts.maintenance)}`);
  if (row.amounts.familyGapEmployee) parts.push(`פער משפחה ${formatShekel(row.amounts.familyGapEmployee)}`);
  return <span>{parts.length ? parts.join(" · ") : "—"}</span>;
}

/**
 * F4: the server's explanation (explain.ts), one line per changed component with its effect on the net; the effects
 * add up to the change shown. Not shown for a non-eligible row: its reason is in the eligibility cell.
 */
function Explanation({ row }: { row: ComparisonRow }) {
  if (row.isToday || !row.eligible || !row.explanation.length) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground" data-testid="explanation">
      {row.explanation.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

function OptionName({ row, withExplanation = false }: { row: ComparisonRow; withExplanation?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{row.label}</span>
      <span className="text-xs text-muted-foreground">
        {TRACK_LABELS[row.track]}
        {row.carGroup ? ` · קבוצה ${row.carGroup}` : ""}
      </span>
      {withExplanation && <Explanation row={row} />}
    </div>
  );
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border md:block" data-testid="comparison-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>אפשרות</TableHead>
            <TableHead>זכאות</TableHead>
            <TableHead>עלות רכב / תקציב</TableHead>
            <TableHead>השתתפות עצמית</TableHead>
            <TableHead>שווי שימוש</TableHead>
            <TableHead>תוספות</TableHead>
            <TableHead>נטו משוער</TableHead>
            <TableHead>שינוי מהיום</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key} data-testid={`row-${row.key}`} className="align-top">
              <TableCell className="max-w-72 whitespace-normal">
                <OptionName row={row} withExplanation />
              </TableCell>
              <TableCell className="max-w-56 whitespace-normal">
                <Eligibility row={row} />
              </TableCell>
              <TableCell>
                {row.kind === "car" ? `${money(row.amounts.carCost)} / ${money(row.amounts.budget)}` : "—"}
              </TableCell>
              <TableCell>
                <Participation row={row} />
              </TableCell>
              <TableCell>{row.kind === "car" ? formatShekel(row.amounts.valueOfUse) : "—"}</TableCell>
              <TableCell className="whitespace-normal">
                <Extras row={row} />
              </TableCell>
              <TableCell data-testid="net">
                <Net row={row} />
              </TableCell>
              <TableCell data-testid="diff">
                <Diff row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

function ComparisonCards({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="flex flex-col gap-3 md:hidden" data-testid="comparison-cards">
      {rows.map((row) => (
        <Card key={row.key} data-testid={`card-${row.key}`} size="sm">
          <CardHeader>
            <CardTitle>
              <OptionName row={row} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="text-sm">
              <Field label="נטו משוער">
                <span data-testid="net">
                  <Net row={row} />
                </span>
              </Field>
              {!row.isToday && (
                <Field label="שינוי מהיום">
                  <span data-testid="diff">
                    <Diff row={row} />
                  </span>
                </Field>
              )}
              <Field label="זכאות">
                <Eligibility row={row} />
              </Field>
              {row.kind === "car" && (
                <>
                  <Field label="עלות רכב / תקציב">{`${money(row.amounts.carCost)} / ${money(row.amounts.budget)}`}</Field>
                  <Field label="השתתפות עצמית">
                    <Participation row={row} />
                  </Field>
                  <Field label="שווי שימוש">{formatShekel(row.amounts.valueOfUse)}</Field>
                </>
              )}
              <Field label="תוספות">
                <Extras row={row} />
              </Field>
            </dl>
            <div className="mt-2">
              <Explanation row={row} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
