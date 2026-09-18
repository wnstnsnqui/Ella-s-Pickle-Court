import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0012, AC-5 and AC-14: `updateStaffRole()`'s validation, its RPC call,
 * the conflict and forbidden mappings, and the event it fires only after a
 * successful write. Clerk and Supabase are the boundaries and are faked here.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth }));

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const staffSupabase = vi.hoisted(() => vi.fn(() => ({ rpc, from })));
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase }));

const captureStaffEvent = vi.hoisted(() => vi.fn());
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ captureStaffEvent, reportFailure }));

const { updateStaffRole } = await import("./actions");

const VALID_INPUT = { clerkUserId: "target_1", role: "admin" as const, isActive: true, version: 1 };

const STAFF_ROW = {
  clerk_user_id: "target_1",
  display_name: "Target",
  email: "target@example.com",
  role: "admin",
  is_active: true,
  last_signed_in_at: "2026-09-17T00:00:00.000Z",
  version: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ isAuthenticated: true, userId: "super_1" });
});

describe("updateStaffRole", () => {
  it("requires a signed in caller before anything else", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });
    const result = await updateStaffRole(VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a malformed payload before calling the database", async () => {
    const result = await updateStaffRole({ clerkUserId: "target_1", role: "not-a-role" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls update_staff_role with the four RPC arguments and returns the updated row", async () => {
    rpc.mockResolvedValue({ data: STAFF_ROW, error: null });
    const result = await updateStaffRole(VALID_INPUT);
    expect(rpc).toHaveBeenCalledWith("update_staff_role", {
      p_clerk_user_id: "target_1",
      p_role: "admin",
      p_is_active: true,
      p_version: 1,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        clerkUserId: "target_1",
        displayName: "Target",
        email: "target@example.com",
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
      target_clerk_user_id: "target_1",
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
