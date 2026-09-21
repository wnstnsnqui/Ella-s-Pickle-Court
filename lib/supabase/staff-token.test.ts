import { decodeJwt, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-6 and invariant 6: the minted token carries exactly
 * the named claims, lives five minutes, is signed with the legacy secret, and
 * cannot be minted at all without it.
 */

const SECRET = "a-legacy-jwt-secret-that-is-long-enough-for-hs256";
const subject = { id: "user_1", username: "ella", name: "Ella" };

beforeEach(() => {
  vi.resetModules();
  process.env.SUPABASE_JWT_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SUPABASE_JWT_SECRET;
  vi.useRealTimers();
});

describe("mintStaffToken", () => {
  it("signs HS256 with SUPABASE_JWT_SECRET and carries sub, role, aud, username and name (AC-6)", async () => {
    const { mintStaffToken } = await import("./staff-token");
    const token = await mintStaffToken(subject);

    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("user_1");
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
    expect(payload.username).toBe("ella");
    expect(payload.name).toBe("Ella");
  });

  it("carries only the named claims, nothing else (invariant 6)", async () => {
    const { mintStaffToken } = await import("./staff-token");
    const payload = decodeJwt(await mintStaffToken(subject));
    expect(Object.keys(payload).sort()).toEqual(
      ["aud", "exp", "iat", "name", "role", "sub", "username"].sort(),
    );
  });

  it("expires five minutes after it was issued (AC-6)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T08:00:00Z"));
    const { mintStaffToken, STAFF_TOKEN_LIFETIME_SECONDS } = await import("./staff-token");
    const payload = decodeJwt(await mintStaffToken(subject));
    expect(STAFF_TOKEN_LIFETIME_SECONDS).toBe(300);
    expect(payload.iat).toBe(Math.floor(Date.parse("2026-09-19T08:00:00Z") / 1000));
    expect(payload.exp).toBe(payload.iat! + 300);
  });

  it("refuses to mint anything when the secret is missing, naming it", async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const { mintStaffToken } = await import("./staff-token");
    await expect(mintStaffToken(subject)).rejects.toThrow(/SUPABASE_JWT_SECRET/);
  });

  it("does not verify under a different secret", async () => {
    const { mintStaffToken } = await import("./staff-token");
    const token = await mintStaffToken(subject);
    await expect(jwtVerify(token, new TextEncoder().encode("another-secret"))).rejects.toThrow();
  });
});
