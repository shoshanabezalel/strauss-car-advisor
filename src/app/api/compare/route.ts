import { z } from "zod";
import { changeOptions, DIRECT_STATUS } from "@/lib/chat/direct-actions";
import { chatDeps } from "@/lib/chat/server";

/**
 * POST /api/compare → the employee picks the options to compare (F5): 1–3 catalog cars or waiver.
 * TODO(M7): conversation-id-only access and no rate limit, like /api/chat (TECH-DESIGN §10).
 */
const Body = z.object({ conversationId: z.uuid(), options: z.array(z.unknown()).min(1).max(3) });

export async function POST(request: Request) {
  const headers = { "cache-control": "no-store" };
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request", message: "הבקשה לא תקינה." }, { status: 400, headers });
  const { store, config, vouSource, notifier, source } = chatDeps();
  const res = await changeOptions({ store, config, vouSource, notifier, source, ...body.data });
  if (!res.ok) return Response.json(res, { status: DIRECT_STATUS[res.error], headers });
  return Response.json(res, { headers });
}
