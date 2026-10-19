import { z } from "zod";
import { chatDeps } from "@/lib/chat/server";
import { appSecret } from "@/lib/env";
import { NO_STORE, secureCookies } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";
import { checkAccessCode, repCookieHeader, signRepSession } from "@/lib/security/rep-session";

/**
 * POST /api/rep/login { code } → a 12h rep session cookie (M7). One shared code (REP_ACCESS_CODE) is a deliberate
 * demo-scope choice; per-rep magic link is the pilot step. 5 tries per 15 minutes per IP.
 */
const Body = z.object({ code: z.string().max(200) });

export async function POST(request: Request) {
  const { rateLimiter, rateLimitScale } = chatDeps();
  // Scaled only on the e2e server (many logins from 127.0.0.1); the deploy has no RATE_LIMIT_SCALE.
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.repLoginIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success || !checkAccessCode(body.data.code, process.env.REP_ACCESS_CODE)) {
    return Response.json({ error: "unauthorized", message: "קוד הגישה שגוי." }, { status: 401, headers: NO_STORE });
  }
  return Response.json({ ok: true }, { headers: { ...NO_STORE, "set-cookie": repCookieHeader(signRepSession(appSecret()), { secure: secureCookies() }) } });
}
