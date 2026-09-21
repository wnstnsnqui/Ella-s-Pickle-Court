import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-1, AC-2, AC-15 and invariant 1: the one gate every
 * account creation passes through. The pool is the boundary and is faked; the
 * cookie is built with the real signer so the test exercises the same header
 * shape `redeemInvite` sends.
 */

const SECRET = "s".repeat(32);

const claimStaffInvite = vi.hoisted(() => vi.fn());
const countAuthUsers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/pool", () => ({ claimStaffInvite, countAuthUsers }));

let configured = true;
vi.mock("@/lib/env", () => ({
  get authConfigured() {
    return configured;
  },
  serverEnv: () => ({
    BETTER_AUTH_SECRET: SECRET,
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_DATABASE_URL: "postgresql://x",
    BOOTSTRAP_OWNER_USERNAME: "Ella",
  }),
}));

const { allowUserCreation } = await import("./gate");
const { INVITE_COOKIE_NAME, signInviteCookie, hashLinkToken } = await import("./invite-cookie");
const { placeholderEmail, STAFF_ONLY_LINE } = await import("./constants");

/** A creation as Better Auth hands it to the hook: the username and its placeholder email. */
const creating = (username: string) => ({ username, email: placeholderEmail(username) });

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
const cookieHeader = (token = TOKEN, secret = SECRET) =>
  `other=1; ${INVITE_COOKIE_NAME}=${signInviteCookie(token, secret)}`;

/** The refusal is always the same fixed line, as a 403. */
async function expectStaffOnly(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ status: "FORBIDDEN", message: STAFF_ONLY_LINE });
}

beforeEach(() => {
  vi.clearAllMocks();
  configured = true;
  countAuthUsers.mockResolvedValue(3);
});

describe("allowUserCreation", () => {
  it("allows a creation whose cookie claims a pending invite, hashing the token first (AC-1)", async () => {
    claimStaffInvite.mockResolvedValue("staff");
    await expect(allowUserCreation(creating("new.hire"), cookieHeader())).resolves.toBeUndefined();
    expect(claimStaffInvite).toHaveBeenCalledWith(hashLinkToken(TOKEN), "new.hire");
    expect(countAuthUsers).not.toHaveBeenCalled();
  });

  it("refuses when the claim finds nothing pending: used, revoked, expired or unknown (AC-1)", async () => {
    claimStaffInvite.mockResolvedValue(null);
    await expectStaffOnly(allowUserCreation(creating("new.hire"), cookieHeader()));
  });

  it("refuses a cookie signed with the wrong secret without touching the database", async () => {
    await expectStaffOnly(
      allowUserCreation(creating("new.hire"), cookieHeader(TOKEN, "t".repeat(32))),
    );
    expect(claimStaffInvite).not.toHaveBeenCalled();
  });

  it("refuses when the pool fails: the link may be burnt, the owner makes a new one (AC-15)", async () => {
    claimStaffInvite.mockRejectedValue(new Error("connection lost"));
    await expect(allowUserCreation(creating("new.hire"), cookieHeader())).rejects.toThrow(
      "connection lost",
    );
  });

  it("allows the bootstrap: no user yet and the bootstrap username, compared lower cased and trimmed (AC-2)", async () => {
    countAuthUsers.mockResolvedValue(0);
    await expect(allowUserCreation(creating("  ELLA "), undefined)).resolves.toBeUndefined();
    expect(claimStaffInvite).not.toHaveBeenCalled();
  });

  it("refuses any other username with no cookie, even while the table is empty (AC-2)", async () => {
    countAuthUsers.mockResolvedValue(0);
    await expectStaffOnly(allowUserCreation(creating("someone"), undefined));
  });

  it("closes the bootstrap once one user exists (AC-2)", async () => {
    countAuthUsers.mockResolvedValue(1);
    await expectStaffOnly(allowUserCreation(creating("ella"), undefined));
  });

  it("refuses a creation with no username, before any cookie or count is looked at", async () => {
    claimStaffInvite.mockResolvedValue("staff");
    countAuthUsers.mockResolvedValue(0);
    await expectStaffOnly(allowUserCreation({ email: "ella@example.com" }, cookieHeader()));
    await expectStaffOnly(
      allowUserCreation({ email: "ella@staff.invalid", username: null }, undefined),
    );
    expect(claimStaffInvite).not.toHaveBeenCalled();
    expect(countAuthUsers).not.toHaveBeenCalled();
  });

  it("refuses an email other than the username's placeholder, so a raw request cannot smuggle one in", async () => {
    claimStaffInvite.mockResolvedValue("staff");
    await expectStaffOnly(
      allowUserCreation({ username: "new.hire", email: "real@example.com" }, cookieHeader()),
    );
    expect(claimStaffInvite).not.toHaveBeenCalled();
  });

  it("refuses everything when Better Auth is not configured", async () => {
    configured = false;
    countAuthUsers.mockResolvedValue(0);
    await expectStaffOnly(allowUserCreation(creating("ella"), cookieHeader()));
  });
});
