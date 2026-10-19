import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Rep screen access (M7, demo scope): one shared code (REP_ACCESS_CODE) → a signed, expiring httpOnly cookie.
 * Per-rep identities via Supabase magic link are the pilot's next step (TECH-DESIGN §10).
 */
export const REP_COOKIE = "rep_session";
export const REP_SESSION_MS = 12 * 60 * 60 * 1000;

/** Constant-time: both sides are hashed first, so the comparison never depends on where they differ. */
export function checkAccessCode(given: string, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

const sign = (expiresAt: string, secret: string) => createHmac("sha256", secret).update(`rep:${expiresAt}`).digest("base64url");

/** `<expiresAt ms>.<HMAC>`: nothing secret inside, and nothing to look up on the server. */
export function signRepSession(secret: string, now = Date.now()): string {
  const expiresAt = String(now + REP_SESSION_MS);
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function verifyRepSession(value: string | undefined, secret: string, now = Date.now()): boolean {
  const match = value?.match(/^(\d+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return false;
  const [, expiresAt, sig] = match;
  if (Number(expiresAt) <= now) return false;
  const expected = Buffer.from(sign(expiresAt, secret));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** An empty value clears the cookie (logout). */
export function repCookieHeader(value: string, { secure }: { secure: boolean }): string {
  const maxAge = value ? REP_SESSION_MS / 1000 : 0;
  return `${REP_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
