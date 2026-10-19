import { NO_STORE, secureCookies } from "@/lib/security/http";
import { repCookieHeader } from "@/lib/security/rep-session";

/** POST /api/rep/logout → clears the rep session cookie. */
export async function POST() {
  return Response.json({ ok: true }, { headers: { ...NO_STORE, "set-cookie": repCookieHeader("", { secure: secureCookies() }) } });
}
