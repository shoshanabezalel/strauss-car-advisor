import { connection } from "next/server";
import { z } from "zod";
import { chatDeps } from "@/lib/chat/server";
import { GAP_TYPES } from "@/lib/gaps/types";
import { hasRepSession, NO_STORE, unauthorized } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/**
 * The information gaps log for the rep screen (G, TECH-DESIGN §7f). Rep session only.
 * GET → `{ groups }`: one line per (type, topic) with the conversation count, last seen and טופל.
 * POST `{ type, topic, resolved }` → sets or clears טופל for that group.
 */
export async function GET(request: Request) {
  // Request-time only: never prerendered at build (see /api/conversation).
  await connection();
  const { store, rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.repGapsIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;
  if (!hasRepSession(request)) return unauthorized();
  return Response.json({ groups: await store.listGapGroups() }, { headers: NO_STORE });
}

const ResolveBody = z.object({ type: z.enum(GAP_TYPES), topic: z.string().trim().min(1).max(120), resolved: z.boolean() });

export async function POST(request: Request) {
  const { store, rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.repGapsIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;
  if (!hasRepSession(request)) return unauthorized();

  const body = ResolveBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request", message: "הבקשה לא תקינה." }, { status: 400, headers: NO_STORE });
  await store.setGapResolved(body.data.type, body.data.topic, body.data.resolved);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
