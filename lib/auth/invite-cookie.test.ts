import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashLinkToken,
  INVITE_COOKIE_NAME,
  readCookie,
  signInviteCookie,
  verifyInviteCookie,
} from "./invite-cookie";

/**
 * Spec 0004 (revised), AC-1 and invariant 3: the token travels to the hook in
 * a signed cookie, the database only ever sees its sha256, and a forged or
 * tampered cookie is worth nothing.
 */

const SECRET = "s".repeat(32);
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

describe("hashLinkToken", () => {
  it("is the sha256 hex the database stores (invariant 3)", () => {
    expect(hashLinkToken(TOKEN)).toBe(createHash("sha256").update(TOKEN).digest("hex"));
    expect(hashLinkToken(TOKEN)).toHaveLength(64);
  });
});

describe("the invite cookie", () => {
  it("round trips a token through sign and verify", () => {
    const value = signInviteCookie(TOKEN, SECRET);
    expect(value.startsWith(`${TOKEN}.`)).toBe(true);
    expect(verifyInviteCookie(value, SECRET)).toBe(TOKEN);
  });

  it("refuses a tampered token, a wrong secret, a bare token and nothing at all", () => {
    const value = signInviteCookie(TOKEN, SECRET);
    expect(verifyInviteCookie(value.replace("AbCd", "XXXX"), SECRET)).toBeNull();
    expect(verifyInviteCookie(value, "t".repeat(32))).toBeNull();
    expect(verifyInviteCookie(TOKEN, SECRET)).toBeNull();
    expect(verifyInviteCookie("", SECRET)).toBeNull();
    expect(verifyInviteCookie(null, SECRET)).toBeNull();
    expect(verifyInviteCookie(`.${"x".repeat(43)}`, SECRET)).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds the named cookie in a raw header, whatever surrounds it", () => {
    const header = `other=1; ${INVITE_COOKIE_NAME}=abc.def; better-auth.session_token=zzz`;
    expect(readCookie(header, INVITE_COOKIE_NAME)).toBe("abc.def");
  });

  it("decodes a percent encoded value and answers null for a missing cookie or header", () => {
    expect(readCookie(`${INVITE_COOKIE_NAME}=a%2Eb`, INVITE_COOKIE_NAME)).toBe("a.b");
    expect(readCookie("other=1", INVITE_COOKIE_NAME)).toBeNull();
    expect(readCookie(undefined, INVITE_COOKIE_NAME)).toBeNull();
    // A prefix of the name is not the name.
    expect(readCookie(`${INVITE_COOKIE_NAME}_x=1`, INVITE_COOKIE_NAME)).toBeNull();
  });
});
