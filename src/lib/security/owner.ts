import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Conversation ownership (M7, TECH-DESIGN §8): the browser that creates a conversation gets a random token in an
 * httpOnly cookie; the DB keeps only its SHA-256 (`conversations.owner_hash`). Every employee route opens a
 * conversation only for the same hash, so a leaked `?c=` link opens nothing in another browser.
 */
export const OWNER_COOKIE = "advisor_owner";
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

export function newOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOwner(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A conversation without an owner (created before M7) belongs to nobody. */
export function ownsConversation(conversation: { ownerHash?: string }, ownerHash: string | undefined): boolean {
  const stored = conversation.ownerHash;
  if (!stored || !ownerHash || stored.length !== ownerHash.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(ownerHash));
}

export function ownerCookieHeader(token: string, { secure }: { secure: boolean }): string {
  return `${OWNER_COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || undefined;
  }
  return undefined;
}
