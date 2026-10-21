import { connection } from "next/server";
import { chatDeps } from "@/lib/chat/server";
import { gapsToCsv } from "@/lib/gaps/csv";
import { hasRepSession, unauthorized } from "@/lib/security/http";
import { clientIp, enforceLimits, LIMITS } from "@/lib/security/rate-limit";

/** GET /api/rep/gaps/csv → "ייצוא CSV" of the grouped gaps (G add-on): UTF-8 with BOM for Excel. Rep session only. */
export async function GET(request: Request) {
  // Request-time only: never prerendered at build (see /api/conversation).
  await connection();
  const { store, source, rateLimiter, rateLimitScale } = chatDeps();
  const limited = await enforceLimits(rateLimiter, [{ limit: LIMITS.repGapsIp, key: clientIp(request) }], rateLimitScale);
  if (limited) return limited;
  if (!hasRepSession(request)) return unauthorized();

  const csv = gapsToCsv(await store.listGapGroups(source));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="information-gaps-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
