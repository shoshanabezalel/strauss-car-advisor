import { describe, expect, it } from "vitest";
import { checkAccessCode, REP_COOKIE, repCookieHeader, REP_SESSION_MS, signRepSession, verifyRepSession } from "@/lib/security/rep-session";

// M7: the rep screen sits behind a shared access code (demo scope; per-rep magic link is the pilot step).
const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 9, 26, 10, 0, 0);

describe("access code", () => {
  it("matches only the exact code; no code configured → nothing matches", () => {
    expect(checkAccessCode("demo-code-1234", "demo-code-1234")).toBe(true);
    expect(checkAccessCode("demo-code-123", "demo-code-1234")).toBe(false);
    expect(checkAccessCode("DEMO-CODE-1234", "demo-code-1234")).toBe(false);
    expect(checkAccessCode("", "demo-code-1234")).toBe(false);
    expect(checkAccessCode("anything", undefined)).toBe(false);
    expect(checkAccessCode("", "")).toBe(false);
  });
});

describe("rep session", () => {
  it("a fresh session verifies until it expires (12h)", () => {
    expect(REP_SESSION_MS).toBe(12 * 60 * 60 * 1000);
    const s = signRepSession(SECRET, NOW);
    expect(verifyRepSession(s, SECRET, NOW)).toBe(true);
    expect(verifyRepSession(s, SECRET, NOW + REP_SESSION_MS - 1)).toBe(true);
    expect(verifyRepSession(s, SECRET, NOW + REP_SESSION_MS + 1)).toBe(false);
  });

  it("a session signed with another secret, a tampered expiry or garbage is rejected", () => {
    const s = signRepSession(SECRET, NOW);
    expect(verifyRepSession(s, "t".repeat(40), NOW)).toBe(false);
    const [exp, sig] = s.split(".");
    expect(verifyRepSession(`${Number(exp) + 86_400_000}.${sig}`, SECRET, NOW)).toBe(false);
    for (const bad of [undefined, "", "abc", "1.2.3", `${exp}.`, `.${sig}`]) expect(verifyRepSession(bad, SECRET, NOW)).toBe(false);
  });

  it("cookie header: httpOnly, SameSite=Strict, 12h; empty value + Max-Age=0 logs out", () => {
    const h = repCookieHeader(signRepSession(SECRET, NOW), { secure: true });
    expect(h).toMatch(new RegExp(`^${REP_COOKIE}=`));
    expect(h).toMatch(/HttpOnly/);
    expect(h).toMatch(/SameSite=Strict/);
    expect(h).toMatch(/Max-Age=43200/);
    expect(h).toMatch(/Secure/);
    expect(repCookieHeader("", { secure: false })).toMatch(/Max-Age=0/);
  });
});
