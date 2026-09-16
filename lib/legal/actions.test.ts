import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0010, AC-11 and AC-13: `acknowledgePrivacyNotice()`'s three outcomes,
 * and the event it fires only after a successful write. Clerk and Supabase
 * are the boundaries and are faked here.
 */

const auth = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth }));

const rpc = vi.hoisted(() => vi.fn());
const staffSupabase = vi.hoisted(() => vi.fn(() => ({ rpc })));
vi.mock("@/lib/supabase/staff", () => ({ staffSupabase }));

const captureStaffEvent = vi.hoisted(() => vi.fn());
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ captureStaffEvent, reportFailure }));

const { acknowledgePrivacyNotice } = await import("./actions");
const { PRIVACY_NOTICE_VERSION } = await import("./constants");

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ isAuthenticated: true, userId: "user_1" });
});

describe("acknowledgePrivacyNotice", () => {
  it("requires a signed in caller before anything else", async () => {
    auth.mockResolvedValue({ isAuthenticated: false, userId: null });
    const result = await acknowledgePrivacyNotice({ version: PRIVACY_NOTICE_VERSION });
    expect(result).toEqual({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a stale version with invalid, before calling the database", async () => {
    const result = await acknowledgePrivacyNotice({ version: "2020-01-01" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid");
      expect(result.error.message).toMatch(/reload/i);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with the version and returns ok with the stored version", async () => {
    rpc.mockResolvedValue({ data: PRIVACY_NOTICE_VERSION, error: null });
    const result = await acknowledgePrivacyNotice({ version: PRIVACY_NOTICE_VERSION });
    expect(rpc).toHaveBeenCalledWith("acknowledge_privacy_notice", {
      version: PRIVACY_NOTICE_VERSION,
    });
    expect(result).toEqual({ ok: true, data: { version: PRIVACY_NOTICE_VERSION } });
  });

  it("sends privacy_notice_acknowledged only after a successful write", async () => {
    rpc.mockResolvedValue({ data: PRIVACY_NOTICE_VERSION, error: null });
    await acknowledgePrivacyNotice({ version: PRIVACY_NOTICE_VERSION });
    expect(captureStaffEvent).toHaveBeenCalledWith("user_1", "privacy_notice_acknowledged", {
      version: PRIVACY_NOTICE_VERSION,
    });
  });

  it("maps an RPC error, no_data_found included, to failed and reports it, without sending an event", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "no_data_found" } });
    const result = await acknowledgePrivacyNotice({ version: PRIVACY_NOTICE_VERSION });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("failed");
    expect(reportFailure).toHaveBeenCalledWith(
      { code: "P0002", message: "no_data_found" },
      { action: "acknowledgePrivacyNotice", distinctId: "user_1" },
    );
    expect(captureStaffEvent).not.toHaveBeenCalled();
  });
});
