import { z } from "zod";
import { DIRECT_STATUS, updateProfileDirect } from "@/lib/chat/direct-actions";
import { chatDeps } from "@/lib/chat/server";

/**
 * POST /api/profile → the employee edits the profile from the form (F5). Source is always "employee".
 * TODO(M7): conversation-id-only access and no rate limit, like /api/chat (TECH-DESIGN §10).
 */
const Body = z.object({ conversationId: z.uuid().optional(), updates: z.array(z.unknown()).min(1).max(10) });

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request", message: "הבקשה לא תקינה." }, { status: 400, headers });
  const { store, config, vouSource, notifier, source } = chatDeps();
  const res = await updateProfileDirect({ store, config, vouSource, notifier, source, ...body.data });
  if (!res.ok) return Response.json(res, { status: DIRECT_STATUS[res.error], headers });
  return Response.json(res, { headers });
}
