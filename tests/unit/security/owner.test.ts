import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/chat/memory-store";
import { hashOwner, newOwnerToken, OWNER_COOKIE, ownerCookieHeader, ownsConversation, readCookie } from "@/lib/security/owner";

// M7: a conversation belongs to the browser that created it (httpOnly cookie; the DB keeps only its SHA-256).
describe("owner token", () => {
  it("random, url-safe, at least 32 bytes of entropy", () => {
    const a = newOwnerToken();
    const b = newOwnerToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,}$/);
  });

  it("hash is a stable hex SHA-256 and never the token itself", () => {
    const t = newOwnerToken();
    expect(hashOwner(t)).toBe(hashOwner(t));
    expect(hashOwner(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOwner(t)).not.toContain(t);
    expect(hashOwner(newOwnerToken())).not.toBe(hashOwner(t));
  });

  it("ownsConversation: only the same hash; a legacy conversation without owner belongs to nobody", () => {
    const h = hashOwner(newOwnerToken());
    expect(ownsConversation({ ownerHash: h }, h)).toBe(true);
    expect(ownsConversation({ ownerHash: h }, hashOwner(newOwnerToken()))).toBe(false);
    expect(ownsConversation({ ownerHash: h }, undefined)).toBe(false);
    expect(ownsConversation({ ownerHash: undefined }, h)).toBe(false);
    expect(ownsConversation({ ownerHash: undefined }, undefined)).toBe(false);
  });

  it("cookie header: httpOnly, SameSite=Lax, path /, 30 days; Secure only when asked", () => {
    const t = newOwnerToken();
    const dev = ownerCookieHeader(t, { secure: false });
    expect(dev).toContain(`${OWNER_COOKIE}=${t}`);
    expect(dev).toMatch(/HttpOnly/);
    expect(dev).toMatch(/SameSite=Lax/);
    expect(dev).toMatch(/Path=\//);
    expect(dev).toMatch(/Max-Age=2592000/);
    expect(dev).not.toMatch(/Secure/);
    expect(ownerCookieHeader(t, { secure: true })).toMatch(/Secure/);
  });

  it("readCookie finds one cookie among several", () => {
    const req = new Request("http://x", { headers: { cookie: `a=1; ${OWNER_COOKIE}=tok-en_1; b=2` } });
    expect(readCookie(req, OWNER_COOKIE)).toBe("tok-en_1");
    expect(readCookie(new Request("http://x"), OWNER_COOKIE)).toBeUndefined();
  });
});

describe("store keeps the owner hash", () => {
  it("create(source, ownerHash) → the snapshot carries it; without one it is undefined", async () => {
    const store = createMemoryStore();
    const h = hashOwner(newOwnerToken());
    const owned = await store.create("app", h);
    const legacy = await store.create("app");
    expect((await store.load(owned))!.ownerHash).toBe(h);
    expect((await store.load(legacy))!.ownerHash).toBeUndefined();
  });
});
