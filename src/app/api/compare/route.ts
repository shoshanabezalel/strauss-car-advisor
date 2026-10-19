import { z } from "zod";
import { changeOptions, DIRECT_STATUS } from "@/lib/chat/direct-actions";
import { chatDeps } from "@/lib/chat/server";
import { NO_STORE, ownerOf } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/**
 * POST /api/compare → the employee picks the options to compare (F5): 1–3 catalog cars or waiver.
 * Only the conversation's owner (cookie, M7).
 */
const Body = z.object({ conversationId: z.uuid(), options: z.array(z.unknown()).min(1).max(3) });

export async function POST(request: Request) {
  const { rateLimiter, rateLimitScale, ...deps } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.directIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request", message: "הבקשה לא תקינה." }, { status: 400, headers: NO_STORE });
  const res = await changeOptions({ ...deps, ownerHash: ownerOf(request).ownerHash, ...body.data });
  if (!res.ok) return Response.json(res, { status: DIRECT_STATUS[res.error], headers: NO_STORE });
  return Response.json(res, { headers: NO_STORE });
}
