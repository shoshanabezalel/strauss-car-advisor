"use client";

import { FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYSLIP_FIELDS, type PayslipField, type PayslipFields, type PayslipNote, type PayslipNotes } from "@/lib/payslip/schema";
import { MAX_PAYSLIP_BYTES, type PayslipResponse } from "@/lib/payslip/upload";
import { INPUT, NUMBER_FIELDS } from "./form-fields";
import { confirmedUpdates, saveProfile } from "./save-profile";

type State =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "error"; message: string }
  | { step: "confirm"; fields: PayslipFields; notes: PayslipNotes };

const ACCEPT = "application/pdf,image/jpeg,image/png";
const NOT_READ = "לא זוהה — יש למלא";
const THIS_MONTH = "זה הסכום בתלוש של החודש הזה. אם זה תשלום חד־פעמי, אפשר לשנות.";
const NOTE_TEXT: Record<PayslipNote, string> = {
  not_on_payslip: "לא מופיע בתלוש",
  computed: "חושב מהסכומים בתלוש",
};
const FAILED = "לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.";
const LABELS = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.field, f])) as Record<PayslipField, (typeof NUMBER_FIELDS)[number]>;

/** One payslip flow per screen (F6): both buttons open the same file picker and the same confirm card. */
export function usePayslip() {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  return { input, state, setState, pick: () => input.current?.click(), close: () => setState({ step: "idle" }) };
}
type Payslip = ReturnType<typeof usePayslip>;

export function PayslipButton({ variant, disabled, onClick }: { variant: "icon" | "text"; disabled: boolean; onClick: () => void }) {
  if (variant === "icon") {
    return (
      <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={onClick} aria-label="העלאת תלוש שכר" title="העלאת תלוש שכר" data-testid="payslip-chat" data-tour="payslip-chat">
        <Paperclip />
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick} data-testid="payslip-panel" data-tour="payslip-panel">
      <FileText /> העלאת תלוש שכר
    </Button>
  );
}

/**
 * The hidden file input and the card: reading → the six fields to confirm → save through /api/profile.
 * Nothing reaches the profile until the employee presses save, and only the fields that have a value.
 */
export function PayslipFlow({ payslip, conversationId, disabled, onSaved }: { payslip: Payslip; conversationId?: string; disabled: boolean; onSaved: (conversationId: string) => void }) {
  const { input, state, setState, close } = payslip;

  async function read(file: File) {
    if (file.size > MAX_PAYSLIP_BYTES) return setState({ step: "error", message: "הקובץ גדול מדי (עד 4MB). אפשר לצלם מסך של התלוש ולהעלות את התמונה." });
    setState({ step: "reading" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/payslip", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as PayslipResponse | null;
      if (body?.status === "ok") return setState({ step: "confirm", fields: body.fields, notes: body.notes });
      setState({ step: "error", message: body && "message" in body ? body.message : FAILED });
    } catch {
      setState({ step: "error", message: FAILED });
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="payslip-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so picking the same file again fires onChange.
          e.target.value = "";
          if (file) void read(file);
        }}
      />
      {state.step !== "idle" && (
        <Card data-testid="payslip-card" aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              פרטים מתלוש השכר
              <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="סגירה" disabled={state.step === "reading"}>
                <X />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {state.step === "reading" && (
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" data-testid="payslip-reading">
                <LoaderCircle className="size-4 animate-spin" /> קורא את התלוש…
              </p>
            )}
            {state.step === "error" && (
              <Alert variant="destructive" data-testid="payslip-error">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
            {state.step === "confirm" && (
              <ConfirmForm fields={state.fields} notes={state.notes} conversationId={conversationId} disabled={disabled} onCancel={close} onSaved={(id) => (close(), onSaved(id))} />
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ConfirmForm({ fields, notes, conversationId, disabled, onCancel, onSaved }: { fields: PayslipFields; notes: PayslipNotes; conversationId?: string; disabled: boolean; onCancel: () => void; onSaved: (id: string) => void }) {
  const [values, setValues] = useState<Record<PayslipField, string>>(
    () => Object.fromEntries(PAYSLIP_FIELDS.map((f) => [f, fields[f] === null ? "" : String(fields[f])])) as Record<PayslipField, string>,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = disabled || saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const updates = confirmedUpdates(values);
    if (!updates.length) return setError("לא מולא אף שדה.");
    setSaving(true);
    setError(null);
    const res = await saveProfile(conversationId, updates);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    onSaved(res.conversationId);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={save} data-testid="payslip-confirm">
      <p className="text-sm text-muted-foreground">אלה הפרטים שקראתי מהתלוש. כדאי לבדוק ולתקן לפני השמירה. הקובץ עצמו לא נשמר.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PAYSLIP_FIELDS.map((f) => {
          const unread = fields[f] === null;
          return (
            <label key={f} className="flex flex-col gap-1 text-sm">
              {LABELS[f].label}
              <input
                className={INPUT}
                type="number"
                inputMode="decimal"
                min={0}
                step={LABELS[f].step === 1 ? "any" : LABELS[f].step}
                dir="ltr"
                value={values[f]}
                onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                disabled={busy}
                aria-invalid={unread && values[f] === ""}
                data-testid={`payslip-${f}`}
              />
              {unread && <span className="text-xs text-brand-orange-ink" data-testid={`payslip-unread-${f}`}>{NOT_READ}</span>}
              {notes[f] && (
                <span className="text-xs text-muted-foreground" data-testid={`payslip-note-${f}`}>
                  {NOTE_TEXT[notes[f]]}
                </span>
              )}
              {(f === "commissions" || f === "bonus") && !notes[f] && <span className="text-xs text-muted-foreground">{THIS_MONTH}</span>}
            </label>
          );
        })}
      </div>
      {error && (
        <Alert variant="destructive" data-testid="payslip-save-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="brand" disabled={busy} data-testid="payslip-save">
          {saving ? "שומר…" : "שמירה וחישוב מחדש"}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
