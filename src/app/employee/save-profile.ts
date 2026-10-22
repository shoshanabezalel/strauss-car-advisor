import { parseNumberInput } from "@/lib/format/amounts";
import type { ProfileField } from "@/lib/agent/schemas";
import { PAYSLIP_FIELDS, type PayslipField } from "@/lib/payslip/schema";

/** The payslip card's save (F6): only the six payslip fields, only those with a value. An empty field is not saved. */
export function confirmedUpdates(values: Partial<Record<string, string>>): { field: PayslipField; value: number }[] {
  return PAYSLIP_FIELDS.filter((f) => Number.isFinite(parseNumberInput(values[f] ?? ""))).map((f) => ({ field: f, value: parseNumberInput(values[f]!) }));
}

export type ProfileSave = { ok: true; conversationId: string } | { ok: false; message: string };

/** POST /api/profile (F5): the form's and the payslip card's only way to change the profile. Source is set server side. */
export async function saveProfile(conversationId: string | undefined, updates: { field: ProfileField; value: unknown }[]): Promise<ProfileSave> {
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, updates }),
    });
    const body = (await res.json().catch(() => ({}))) as { conversationId?: string; message?: string };
    if (!res.ok || !body.conversationId) return { ok: false, message: body.message ?? "לא הצלחתי לשמור." };
    return { ok: true, conversationId: body.conversationId };
  } catch {
    return { ok: false, message: "לא הצלחתי להתחבר לשרת. אפשר לנסות שוב." };
  }
}
