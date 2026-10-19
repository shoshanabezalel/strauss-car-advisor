"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileField } from "@/lib/agent/schemas";
import type { ProfileView } from "@/lib/chat/profile-view";
import { FIELD_LABELS } from "./labels";

const INPUT =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-amber-500 md:text-sm dark:bg-input/30";

const NUMBER_FIELDS = [
  { field: "baseSalary", label: "שכר בסיס (₪)", step: 1 },
  { field: "commissions", label: "עמלות (₪)", step: 1 },
  { field: "bonus", label: "בונוס (₪)", step: 1 },
  { field: "pensionPct", label: "הפרשה לפנסיה (%)", step: 0.1 },
  { field: "studyFundPct", label: "קרן השתלמות (%)", step: 0.1 },
  { field: "creditPoints", label: "נקודות זיכוי", step: 0.25 },
  { field: "childrenUnder23", label: "ילדים עד גיל עשרים ושלוש", step: 1 },
] as const satisfies readonly { field: ProfileField; label: string; step: number }[];

const WAIVER = "waiver";
type Form = Record<string, string>;

/** Strings for the inputs: the server already gives values as the employee says them (percents ×100). */
function toForm(v: ProfileView["values"]): Form {
  const s = (n: number | undefined) => (n === undefined ? "" : String(n));
  const current = v.current;
  return {
    occupation: v.occupation ?? "",
    group: v.group ?? "",
    ...Object.fromEntries(NUMBER_FIELDS.map(({ field }) => [field, s(v[field])])),
    currentCar: current ? (current.kind === "waiver" ? WAIVER : current.carId) : "",
    currentParticipation: current?.kind === "car" ? s(current.participation) : "",
  };
}

/**
 * "My details" next to the chat (F5). Sends only the changed fields to POST /api/profile; the server applies them
 * with updateProfile and recomputes. Rep-confirmed fields are read-only. Collapsible on phones.
 */
export function ProfilePanel({
  profile,
  conversationId,
  disabled,
  onSaved,
}: {
  profile: ProfileView;
  conversationId?: string;
  disabled: boolean;
  onSaved: (conversationId: string) => void;
}) {
  const initial = toForm(profile.values);
  const [form, setForm] = useState<Form>(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = new Set(profile.locked);
  const missing = new Set<string>(profile.missing);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function updates(): { field: ProfileField; value: unknown }[] {
    const out: { field: ProfileField; value: unknown }[] = [];
    for (const k of ["occupation", "group"] as const) if (form[k] && form[k] !== initial[k]) out.push({ field: k, value: form[k] });
    for (const { field } of NUMBER_FIELDS) {
      if (form[field] !== "" && form[field] !== initial[field]) out.push({ field, value: Number(form[field]) });
    }
    const carChanged = form.currentCar !== initial.currentCar || form.currentParticipation !== initial.currentParticipation;
    if (form.currentCar && carChanged) {
      out.push({
        field: "current",
        value:
          form.currentCar === WAIVER
            ? { kind: "waiver" }
            : { kind: "car", carId: form.currentCar, ...(form.currentParticipation !== "" ? { participation: Number(form.currentParticipation) } : {}) },
      });
    }
    return out.filter((u) => !locked.has(u.field));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const changes = updates();
    if (!changes.length) return setError("לא שונה אף שדה.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, updates: changes }),
      });
      const body = (await res.json().catch(() => ({}))) as { conversationId?: string; message?: string };
      if (!res.ok || !body.conversationId) return setError(body.message ?? "לא הצלחתי לשמור.");
      onSaved(body.conversationId);
    } catch {
      setError("לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: ProfileField, label: string, control: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex flex-wrap items-center gap-1">
        {label}
        {locked.has(key) && (
          <Badge variant="secondary" data-testid={`locked-${key}`}>
            <Lock /> אושר ע״י נציג/ת
          </Badge>
        )}
        {missing.has(key) && <span className="text-xs text-amber-700">חסר</span>}
      </span>
      {control}
    </label>
  );
  const busy = disabled || saving;

  return (
    <Card data-testid="profile-panel" className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          הפרטים שלי
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="profile-form"
            onClick={() => setOpen((o) => !o)}
            data-testid="profile-toggle"
          >
            {open ? "הסתרה" : "עריכה"}
            <ChevronDown className={open ? "rotate-180" : ""} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent id="profile-form" className={open ? "block" : "hidden lg:block"}>
        <form className="flex flex-col gap-3" onSubmit={save}>
          {field(
            "occupation",
            FIELD_LABELS.occupation,
            <select className={INPUT} value={form.occupation} onChange={set("occupation")} disabled={busy || locked.has("occupation")} aria-invalid={missing.has("occupation")} data-testid="profile-occupation">
              <option value="">בחירה…</option>
              {profile.choices.occupations.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>,
          )}
          {field(
            "group",
            FIELD_LABELS.group,
            <select className={INPUT} value={form.group} onChange={set("group")} disabled={busy || locked.has("group")} aria-invalid={missing.has("group")} data-testid="profile-group">
              <option value="">בחירה…</option>
              {profile.choices.groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>,
          )}
          <div className="grid grid-cols-2 gap-3">
            {NUMBER_FIELDS.map(({ field: f, label, step }) => (
              <div key={f} className={f === "childrenUnder23" ? "col-span-2" : undefined}>
                {field(
                  f,
                  label,
                  <input
                    className={INPUT}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={step}
                    dir="ltr"
                    value={form[f]}
                    onChange={set(f)}
                    disabled={busy || locked.has(f)}
                    aria-invalid={missing.has(f)}
                    data-testid={`profile-${f}`}
                  />,
                )}
              </div>
            ))}
          </div>
          {field(
            "current",
            "הרכב שלי היום",
            <select className={INPUT} value={form.currentCar} onChange={set("currentCar")} disabled={busy || locked.has("current")} aria-invalid={missing.has("current")} data-testid="profile-current-car">
              <option value="">בחירה…</option>
              {profile.choices.allCars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.group})
                </option>
              ))}
              <option value={WAIVER}>ויתור על רכב (אחזקת רכב)</option>
            </select>,
          )}
          {form.currentCar && form.currentCar !== WAIVER && (
            <label className="flex flex-col gap-1 text-sm">
              השתתפות עצמית היום (₪)
              <input
                className={INPUT}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                dir="ltr"
                value={form.currentParticipation}
                onChange={set("currentParticipation")}
                disabled={busy || locked.has("current")}
                data-testid="profile-current-participation"
              />
            </label>
          )}
          {error && (
            <Alert variant="destructive" data-testid="profile-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={busy} data-testid="profile-save">
            {saving ? "שומר…" : "שמירה וחישוב מחדש"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
