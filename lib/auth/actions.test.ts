import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004 (revised), AC-1, AC-7 and invariant 7a: the two Server Actions
 * that run before any session exists. Better Auth and the pool are the
 * boundaries and are faked. The cross check trap the spec
 * names: the `cookie` header `redeemInvite` builds by hand is verified with
 * the same parser the hook uses, so the two halves cannot drift apart.
 */

const SECRET = "s".repeat(32);
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

const signUpEmail = vi.hoisted(() => vi.fn());
const hash = vi.hoisted(() => vi.fn(async (password: string) => `hashed:${password}`));
const findCredentialAccount = vi.hoisted(() => vi.fn());
const updatePassword = vi.hoisted(() => vi.fn());
const createAccount = vi.hoisted(() => vi.fn());
const deleteUserSessions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  auth: {
    api: { signUpEmail },
    $context: Promise.resolve({
      password: { hash },
      internalAdapter: { findCredentialAccount, updatePassword, createAccount, deleteUserSessions },
    }),
  },
}));

const claimStaffReset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/pool", () => ({ claimStaffReset }));

const captureStaffEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ captureStaffEvent }));

vi.mock("@/lib/env", () => ({
  authConfigured: true,
  serverEnv: () => ({ BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "http://localhost:3000" }),
}));

const { redeemInvite, resetPassword } = await import("./actions");
const { INVITE_COOKIE_NAME, readCookie, verifyInviteCookie } = await import("./invite-cookie");
const { placeholderEmail } = await import("./constants");

const account = { name: "Ella", username: "Ella.P", password: "a".repeat(10) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("redeemInvite (AC-1)", () => {
  it("calls Better Auth with a cookie header the hook can verify, then lands (the cross check)", async () => {
    signUpEmail.mockResolvedValue({ user: { id: "user_new" } });

    const result = await redeemInvite({ token: TOKEN, ...account });

    expect(result).toEqual({ ok: true });
    const [call] = signUpEmail.mock.calls;
    // The username is lower cased before Better Auth sees it, and the email
    // is the placeholder the gate insists on.
    expect(call[0].body).toEqual({
      name: "Ella",
      username: "ella.p",
      email: placeholderEmail("ella.p"),
      password: account.password,
    });
    const header = (call[0].headers as Headers).get("cookie");
    expect(verifyInviteCookie(readCookie(header, INVITE_COOKIE_NAME), SECRET)).toBe(TOKEN);
    expect(captureStaffEvent).toHaveBeenCalledWith("user_new", "staff_invite_redeemed", {
      kind: "invite",
      method: "password",
    });
  });

  it("maps the hook's FORBIDDEN to invite_invalid", async () => {
    signUpEmail.mockRejectedValue(new APIError("FORBIDDEN", { message: "no" }));
    const result = await redeemInvite({ token: TOKEN, ...account });
    expect(result).toMatchObject({ ok: false, error: { kind: "invite_invalid" } });
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("maps a taken username to username_taken, from either check that can catch it", async () => {
    signUpEmail.mockRejectedValue(new APIError("BAD_REQUEST", { message: "taken" }));
    expect(await redeemInvite({ token: TOKEN, ...account })).toMatchObject({
      ok: false,
      error: { kind: "username_taken" },
    });
    signUpEmail.mockRejectedValue(new APIError("UNPROCESSABLE_ENTITY", { message: "exists" }));
    expect(await redeemInvite({ token: TOKEN, ...account })).toMatchObject({
      ok: false,
      error: { kind: "username_taken" },
    });
  });

  it("refuses a username the plugin would refuse, so no invite is ever burnt on one", async () => {
    const bad = await redeemInvite({ token: TOKEN, ...account, username: "no spaces!" });
    expect(bad).toMatchObject({ ok: false, error: { kind: "invalid" } });
    if (bad.ok || bad.error.kind !== "invalid") throw new Error("expected invalid");
    expect(Object.keys(bad.error.issues ?? {})).toEqual(["username"]);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("validates first: a bad token or short password never reaches Better Auth", async () => {
    const bad = await redeemInvite({ token: "nope", ...account, password: "short" });
    expect(bad).toMatchObject({ ok: false, error: { kind: "invalid" } });
    if (bad.ok || bad.error.kind !== "invalid") throw new Error("expected invalid");
    expect(Object.keys(bad.error.issues ?? {}).sort()).toEqual(["password", "token"]);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("answers failed, not a throw, when Better Auth itself fails", async () => {
    signUpEmail.mockRejectedValue(new Error("pool down"));
    const result = await redeemInvite({ token: TOKEN, ...account });
    expect(result).toMatchObject({ ok: false, error: { kind: "failed" } });
  });
});

describe("resetPassword (AC-7)", () => {
  it("claims the link, hashes with Better Auth, updates the credential account and ends every session", async () => {
    claimStaffReset.mockResolvedValue("user_target");
    findCredentialAccount.mockResolvedValue({ id: "acct" });

    const result = await resetPassword({ token: TOKEN, password: "new-password-1" });

    expect(result).toEqual({ ok: true });
    expect(hash).toHaveBeenCalledWith("new-password-1");
    expect(updatePassword).toHaveBeenCalledWith("user_target", "hashed:new-password-1");
    expect(createAccount).not.toHaveBeenCalled();
    expect(deleteUserSessions).toHaveBeenCalledWith("user_target");
    expect(captureStaffEvent).toHaveBeenCalledWith("user_target", "staff_password_changed", {
      source: "reset",
    });
  });

  it("creates the credential account when the row is somehow missing", async () => {
    claimStaffReset.mockResolvedValue("user_target");
    findCredentialAccount.mockResolvedValue(null);

    await resetPassword({ token: TOKEN, password: "new-password-1" });

    expect(createAccount).toHaveBeenCalledWith({
      userId: "user_target",
      providerId: "credential",
      accountId: "user_target",
      password: "hashed:new-password-1",
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("answers invite_invalid when the claim finds nothing pending, touching no password", async () => {
    claimStaffReset.mockResolvedValue(null);
    const result = await resetPassword({ token: TOKEN, password: "new-password-1" });
    expect(result).toMatchObject({ ok: false, error: { kind: "invite_invalid" } });
    expect(hash).not.toHaveBeenCalled();
  });

  it("reports a write failure after the claim as failed; the link is burnt (AC-15)", async () => {
    claimStaffReset.mockResolvedValue("user_target");
    findCredentialAccount.mockRejectedValue(new Error("adapter down"));
    const result = await resetPassword({ token: TOKEN, password: "new-password-1" });
    expect(result).toMatchObject({ ok: false, error: { kind: "failed" } });
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });
});
