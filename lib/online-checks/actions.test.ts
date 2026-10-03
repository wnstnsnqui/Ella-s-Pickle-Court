import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0016, AC-14 and AC-19: what the decision actions hand the sheet for
 * every answer a decision function can give, and which of them send an
 * event. The session, Supabase and analytics are the boundaries and are faked
 * here; the rules themselves are proven against Postgres in
 * `supabase/tests/online_checks.test.ts`.
 */

const rpc = vi.hoisted(() => vi.fn());
const createSignedUrl = vi.hoisted(() => vi.fn());
const requireStaff = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions")>()),
  requireStaff,
}));

const captureStaffEvent = vi.hoisted(() => vi.fn());
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/server", () => ({ captureStaffEvent, reportFailure }));

const getProofPath = vi.hoisted(() => vi.fn());
vi.mock("./queries", () => ({
  getOnlineChecks: vi.fn(),
  getStaffBooking: vi.fn(),
  getBookingIdByCode: vi.fn(),
  getProofPath,
}));

const {
  cancelOnlineBooking,
  confirmOnlineBooking,
  findOnlineBooking,
  getProofUrl,
  rejectOnlineBooking,
  settleOnlineRefund,
} = await import("./actions");

const success = {
  ok: true,
  version: 4,
  previous_status: "pending_check",
  submitted_at: "2026-10-30T08:00:00Z",
  decided_at: "2026-10-30T09:30:59Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  requireStaff.mockResolvedValue({
    ok: true,
    staffId: "staff-1",
    supabase: { rpc, storage: { from: () => ({ createSignedUrl }) } },
  });
});

describe("confirmOnlineBooking", () => {
  it("sends the version it was given and answers with the new one (AC-7)", async () => {
    rpc.mockResolvedValue({ data: success, error: null });
    const result = await confirmOnlineBooking({ bookingId: 7, version: 3 });
    expect(rpc).toHaveBeenCalledWith("confirm_online_booking", { p_booking_id: 7, p_version: 3 });
    expect(result).toEqual({ ok: true, data: { version: 4 } });
  });

  it("sends whole minutes waiting and nothing else, after the write (AC-19)", async () => {
    rpc.mockResolvedValue({ data: success, error: null });
    await confirmOnlineBooking({ bookingId: 7, version: 3 });
    expect(captureStaffEvent).toHaveBeenCalledWith("staff-1", "online_booking_confirmed", {
      minutes_waiting: 90,
    });
  });

  it("reads stale and wrong_state as one conflict with the refresh message, and sends nothing (AC-14)", async () => {
    for (const reason of ["stale", "wrong_state"]) {
      rpc.mockResolvedValue({ data: { ok: false, reason }, error: null });
      const result = await confirmOnlineBooking({ bookingId: 7, version: 3 });
      expect(result).toMatchObject({
        ok: false,
        error: {
          kind: "conflict",
          message: "Someone else just updated this booking. Here's where it stands now.",
        },
      });
    }
    expect(captureStaffEvent).not.toHaveBeenCalled();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("reads forbidden as the managers only line (AC-7, AC-15)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "forbidden" }, error: null });
    const result = await confirmOnlineBooking({ bookingId: 7, version: 3 });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "forbidden",
        message: "Only an owner or admin can confirm or turn down a payment.",
      },
    });
  });

  it("never calls the database for a signed out caller", async () => {
    requireStaff.mockResolvedValue({
      ok: false,
      error: { kind: "unauthenticated", message: "Sign in to change a court." },
    });
    const result = await confirmOnlineBooking({ bookingId: 7, version: 3 });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("rejectOnlineBooking and cancelOnlineBooking", () => {
  it("passes the reason, a trimmed note and the refund box, and says whether it was confirmed (AC-8, AC-19)", async () => {
    rpc.mockResolvedValue({ data: { ...success, previous_status: "confirmed" }, error: null });
    await rejectOnlineBooking({
      bookingId: 7,
      version: 3,
      reason: "amount_mismatch",
      note: "  Paid 500  ",
      refundOwed: true,
    });
    expect(rpc).toHaveBeenCalledWith("reject_online_booking", {
      p_booking_id: 7,
      p_version: 3,
      p_reason: "amount_mismatch",
      p_note: "Paid 500",
      p_refund_owed: true,
    });
    expect(captureStaffEvent).toHaveBeenCalledWith("staff-1", "online_booking_rejected", {
      reason: "amount_mismatch",
      refund_owed: true,
      was_confirmed: true,
    });
  });

  it("refuses Other with no note before reaching Postgres", async () => {
    const result = await cancelOnlineBooking({
      bookingId: 7,
      version: 3,
      reason: "other",
      refundOwed: false,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the row guard's refusal to the plain online booking message (AC-11)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "online_booking_guard: this is an online booking" },
    });
    const result = await cancelOnlineBooking({
      bookingId: 7,
      version: 3,
      reason: "player_asked",
      refundOwed: false,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "invalid",
        message: "This is an online booking. Use its own buttons in the sheet.",
      },
    });
    expect(reportFailure).not.toHaveBeenCalled();
  });
});

describe("settleOnlineRefund", () => {
  it("sends only the outcome (AC-12, AC-19)", async () => {
    rpc.mockResolvedValue({ data: success, error: null });
    await settleOnlineRefund({ bookingId: 7, version: 3, outcome: "refunded", amount: 500 });
    expect(rpc).toHaveBeenCalledWith(
      "settle_online_refund",
      expect.objectContaining({ p_outcome: "refunded", p_amount: 500 }),
    );
    expect(captureStaffEvent).toHaveBeenCalledWith("staff-1", "online_booking_refund_settled", {
      outcome: "refunded",
    });
  });
});

describe("findOnlineBooking", () => {
  it("answers an invalid code with the example message (AC-3)", async () => {
    const result = await findOnlineBooking({ code: "K7M" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: "A code is 8 letters and numbers, like K7MQ-3XPT." },
    });
  });
});

describe("getProofUrl (AC-17)", () => {
  it("signs the path for 5 minutes with the staff client", async () => {
    getProofPath.mockResolvedValue({ ok: true, path: "7/abc" });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
    const result = await getProofUrl({ bookingId: 7 });
    expect(createSignedUrl).toHaveBeenCalledWith("7/abc", 300);
    expect(result).toMatchObject({ ok: true, data: { url: "https://signed" } });
  });

  it("reads a purged proof as deleted, without asking Storage", async () => {
    getProofPath.mockResolvedValue({ ok: true, path: null });
    const result = await getProofUrl({ bookingId: 7 });
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
