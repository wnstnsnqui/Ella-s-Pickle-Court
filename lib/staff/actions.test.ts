import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0012, AC-5 and AC-14: `updateStaffRole()`'s validation, its RPC call,
 * the conflict and forbidden mappings, and the event it fires only after a
 * successful write. Spec 0004 (revised), AC-3 and AC-8: the invite link
 * actions, and the session revocation on deactivation. Better Auth and
 * Supabase are the boundaries and are faked here.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentSession: auth }));

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const staffSupabase = vi.hoisted(() => vi.fn(() => ({ rpc, from })));
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase }));

const captureStaffEvent = vi.hoisted(() => vi.fn());
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ captureStaffEvent, reportFailure }));

const deleteUserSessions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  auth: { $context: Promise.resolve({ internalAdapter: { deleteUserSessions } }) },
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ BETTER_AUTH_URL: "https://courts.example" }),
}));

const { updateStaffRole, createStaffInvite, revokeStaffInvite } = await import("./actions");
const { hashLinkToken } = await import("@/lib/auth/invite-cookie");

const VALID_INPUT = { userId: "target_1", role: "admin" as const, isActive: true, version: 1 };

const STAFF_ROW = {
  user_id: "target_1",
  display_name: "Target",
  username: "target",
  role: "admin",
  is_active: true,
  last_signed_in_at: "2026-09-17T00:00:00.000Z",
  version: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "super_1" } });
});

describe("updateStaffRole", () => {
  it("requires a signed in caller before anything else", async () => {
    auth.mockResolvedValue(null);
    const result = await updateStaffRole(VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a malformed payload before calling the database", async () => {
    const result = await updateStaffRole({ userId: "target_1", role: "not-a-role" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls update_staff_role with the four RPC arguments and returns the updated row", async () => {
    rpc.mockResolvedValue({ data: STAFF_ROW, error: null });
    const result = await updateStaffRole(VALID_INPUT);
    expect(rpc).toHaveBeenCalledWith("update_staff_role", {
      p_user_id: "target_1",
      p_role: "admin",
      p_is_active: true,
      p_version: 1,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        userId: "target_1",
        displayName: "Target",
        username: "target",
        role: "admin",
        isActive: true,
        lastSignedInAt: "2026-09-17T00:00:00.000Z",
        version: 2,
      },
    });
  });

  it("sends staff_role_changed only after a successful write", async () => {
    rpc.mockResolvedValue({ data: STAFF_ROW, error: null });
    await updateStaffRole(VALID_INPUT);
    expect(captureStaffEvent).toHaveBeenCalledWith("super_1", "staff_role_changed", {
      target_user_id: "target_1",
      role: "admin",
      is_active: true,
    });
  });

  it("maps 42501 to forbidden, without sending an event", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not superadmin" } });
    const result = await updateStaffRole(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("maps P0002 to a version_stale conflict with a staff specific message", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "stale_version" } });
    const result = await updateStaffRole(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("conflict");
      if (result.error.kind === "conflict") expect(result.error.reason).toBe("version_stale");
      expect(result.error.message).toMatch(/account/i);
    }
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });
});

describe("updateStaffRole and sessions (spec 0004, AC-8)", () => {
  it("deletes every Better Auth session of the account after a successful deactivation", async () => {
    rpc.mockResolvedValue({ data: { ...STAFF_ROW, is_active: false }, error: null });
    const result = await updateStaffRole({ ...VALID_INPUT, isActive: false });
    expect(result.ok).toBe(true);
    expect(deleteUserSessions).toHaveBeenCalledWith("target_1");
  });

  it("leaves sessions alone on a role change that keeps the account active", async () => {
    rpc.mockResolvedValue({ data: STAFF_ROW, error: null });
    await updateStaffRole(VALID_INPUT);
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it("never revokes when the row write was refused", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "refused" } });
    await updateStaffRole({ ...VALID_INPUT, isActive: false });
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it("logs and reports a revocation failure but still answers ok: the row is already inactive", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: { ...STAFF_ROW, is_active: false }, error: null });
    deleteUserSessions.mockRejectedValueOnce(new Error("pool down"));
    const result = await updateStaffRole({ ...VALID_INPUT, isActive: false });
    expect(result.ok).toBe(true);
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("pool down") }),
      expect.objectContaining({ action: "updateStaffRole.deleteUserSessions" }),
    );
  });
});

describe("createStaffInvite (spec 0004, AC-3)", () => {
  const INVITE_ROW = { id: "inv_1", expires_at: "2026-09-26T00:00:00.000Z" };

  it("hashes a fresh 32 byte token for the database and returns the plain one in the link, once", async () => {
    rpc.mockResolvedValue({ data: INVITE_ROW, error: null });

    const result = await createStaffInvite({ kind: "invite", role: "staff" });

    if (!result.ok) throw new Error("expected ok");
    const token = result.data.url.replace("https://courts.example/sign-up/", "");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // `toStrictEqual` semantics: `p_target_user_id` must be absent, not
    // `undefined`, since the function only declares defaults for what is
    // left out entirely.
    expect(rpc.mock.calls[0]).toStrictEqual([
      "create_staff_invite",
      { p_kind: "invite", p_role: "staff", p_token_hash: hashLinkToken(token) },
    ]);
    expect(result.data.expiresAt).toBe(INVITE_ROW.expires_at);
    expect(captureStaffEvent).toHaveBeenCalledWith("super_1", "staff_invite_created", {
      kind: "invite",
      role: "staff",
    });
  });

  it("makes a reset link under /reset for a target account", async () => {
    rpc.mockResolvedValue({ data: INVITE_ROW, error: null });
    const result = await createStaffInvite({ kind: "reset", targetUserId: "target_1" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.url).toMatch(/^https:\/\/courts\.example\/reset\/[A-Za-z0-9_-]{43}$/);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_kind: "reset", p_target_user_id: "target_1" });
    expect(captureStaffEvent).toHaveBeenCalledWith("super_1", "staff_invite_created", {
      kind: "reset",
      role: null,
    });
  });

  it("refuses owner as a role and a reset with no target at the boundary", async () => {
    expect((await createStaffInvite({ kind: "invite", role: "owner" })).ok).toBe(false);
    expect((await createStaffInvite({ kind: "reset" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the function's own refusal (22023) through as invalid with its message", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "Two accounts already hold superadmin." },
    });
    const result = await createStaffInvite({ kind: "invite", role: "superadmin" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: "Two accounts already hold superadmin." },
    });
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("maps a policy refusal to forbidden for a staff caller", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "refused" } });
    const result = await createStaffInvite({ kind: "invite", role: "staff" });
    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
  });
});

describe("revokeStaffInvite (spec 0004, AC-3)", () => {
  const ID = "6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e";

  it("calls the function and fires the event after success", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await revokeStaffInvite({ id: ID, kind: "invite" });
    expect(result).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith("revoke_staff_invite", { p_id: ID });
    expect(captureStaffEvent).toHaveBeenCalledWith("super_1", "staff_invite_revoked", {
      kind: "invite",
    });
  });

  it("maps an already claimed or revoked link (P0002) to a named conflict", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "gone" } });
    const result = await revokeStaffInvite({ id: ID, kind: "reset" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "conflict", reason: "version_stale" },
    });
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid before calling anything", async () => {
    expect((await revokeStaffInvite({ id: "1", kind: "invite" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
