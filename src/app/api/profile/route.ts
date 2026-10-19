import { z } from "zod";
import { DIRECT_STATUS, updateProfileDirect } from "@/lib/chat/direct-actions";
import { chatDeps } from "@/lib/chat/server";
import { NO_STORE, ownerOf } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/**
 * POST /api/profile → the employee edits the profile from the form (F5). Source is always "employee".
 * Only the conversation's owner (cookie, M7); without a conversation id the form starts one for the caller.
 */
const Body = z.object({ conversationId: z.uuid().optional(), updates: z.array(z.unknown()).min(1).max(10) });

export async function POST(request: Request) {
  const { rateLimiter, rateLimitScale, ...deps } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.directIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request", message: "הבקשה לא תקינה." }, { status: 400, headers: NO_STORE });
  const owner = ownerOf(request);
  const res = await updateProfileDirect({ ...deps, ownerHash: owner.ownerHash, ...body.data });
  const headers = { ...NO_STORE, ...(res.ok && owner.setCookie ? { "set-cookie": owner.setCookie } : {}) };
  if (!res.ok) return Response.json(res, { status: DIRECT_STATUS[res.error], headers });
  return Response.json(res, { headers });
}
