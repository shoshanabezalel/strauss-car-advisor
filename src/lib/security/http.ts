import "server-only";
import { appSecret } from "@/lib/env";
import { hashOwner, newOwnerToken, OWNER_COOKIE, ownerCookieHeader, readCookie } from "./owner";
import { REP_COOKIE, verifyRepSession } from "./rep-session";

/** Request plumbing for the API routes (M7): owner cookie, rep session, JSON errors. */

/** Cookies are Secure on the deployed site; the local dev / e2e servers run on plain http. */
export const secureCookies = () => process.env.NODE_ENV === "production";

/**
 * The caller's owner hash. A browser without the cookie gets a fresh token, and `setCookie` is the header to send
 * with the response, so a conversation it creates is its own from then on.
 */
export function ownerOf(request: Request): { ownerHash: string; setCookie?: string } {
  const token = readCookie(request, OWNER_COOKIE);
  if (token) return { ownerHash: hashOwner(token) };
  const fresh = newOwnerToken();
  return { ownerHash: hashOwner(fresh), setCookie: ownerCookieHeader(fresh, { secure: secureCookies() }) };
}

export function hasRepSession(request: Request): boolean {
  return verifyRepSession(readCookie(request, REP_COOKIE), appSecret());
}

export const NO_STORE = { "cache-control": "no-store" } as const;

export const unauthorized = () =>
  Response.json({ error: "unauthorized", message: "צריך להיכנס עם קוד הגישה של הנציגים." }, { status: 401, headers: NO_STORE });
