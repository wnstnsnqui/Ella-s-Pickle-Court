// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffBooking } from "@/lib/online-checks/types";

/**
 * Spec 0016, AC-14: a step sends the version the manager decided on, not one
 * a live read slipped under it while the step was open. Another board's
 * confirm must come back as "Someone else just updated this booking", never
 * as a turn down of a booking the manager did not see confirmed.
 */

const actions = vi.hoisted(() => ({
  loadStaffBooking: vi.fn(),
  confirmOnlineBooking: vi.fn(),
  rejectOnlineBooking: vi.fn(),
  cancelOnlineBooking: vi.fn(),
  settleOnlineRefund: vi.fn(),
}));
vi.mock("@/lib/online-checks/actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useOnlineBooking } = await import("./use-online-booking");

function booking(version: number, status: StaffBooking["status"]): StaffBooking {
  return { id: 7, version, status, refundStatus: null } as StaffBooking;
}

const STALE = {
  ok: false,
  error: { kind: "conflict", message: "Someone else just updated this booking." },
};

describe("useOnlineBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the version the step was opened on, after a live read moved it (AC-14)", async () => {
    actions.loadStaffBooking.mockResolvedValueOnce({ ok: true, data: booking(2, "pending_check") });
    actions.rejectOnlineBooking.mockResolvedValue(STALE);

    const { result, rerender } = renderHook(
      ({ changeKey }) => useOnlineBooking({ bookingId: 7, changeKey, onDecided: vi.fn() }),
      { initialProps: { changeKey: "0" } },
    );
    await waitFor(() => expect(result.current.load.state).toBe("loaded"));
    act(() => result.current.setStep({ kind: "turn_down" }));

    // Another board confirms: the live event reads the booking again.
    actions.loadStaffBooking.mockResolvedValueOnce({ ok: true, data: booking(3, "confirmed") });
    rerender({ changeKey: "1" });
    await waitFor(() => {
      const load = result.current.load;
      expect(load.state === "loaded" && load.booking.version).toBe(3);
    });

    actions.loadStaffBooking.mockResolvedValue({ ok: true, data: booking(3, "confirmed") });
    await act(() =>
      result.current.end("turn_down", { reason: "amount_mismatch", note: "", refundOwed: true }),
    );

    expect(actions.rejectOnlineBooking).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2 }),
    );
    expect(result.current.notice).toBe("Someone else just updated this booking.");
    expect(result.current.step).toBeNull();
  });

  it("sends the fresh version for a step opened after the live read", async () => {
    actions.loadStaffBooking.mockResolvedValue({ ok: true, data: booking(3, "confirmed") });
    actions.cancelOnlineBooking.mockResolvedValue({ ok: true, data: {} });

    const { result } = renderHook(() =>
      useOnlineBooking({ bookingId: 7, changeKey: "0", onDecided: vi.fn() }),
    );
    await waitFor(() => expect(result.current.load.state).toBe("loaded"));
    act(() => result.current.setStep({ kind: "cancel" }));
    await act(() =>
      result.current.end("cancel", { reason: "player_request", note: "", refundOwed: true }),
    );

    expect(actions.cancelOnlineBooking).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3 }),
    );
  });
});
