// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OnlineCheckItem, OnlineChecks } from "@/lib/online-checks/types";

/**
 * Spec 0016, AC-5 and AC-2: a booking id new to To check is handed on for its
 * toast exactly once per tab, never on the first load, and a failed read
 * leaves a loaded list on screen. The action is the boundary and is faked; the
 * schedule channel is a plain listener the test fires by hand.
 */

const refreshOnlineChecks = vi.hoisted(() => vi.fn());
vi.mock("@/lib/online-checks/actions", () => ({ refreshOnlineChecks }));

const { useOnlineChecks } = await import("./use-online-checks");

const item = (bookingId: number) => ({ bookingId }) as OnlineCheckItem;
const checks = (...ids: number[]): OnlineChecks =>
  ({
    toCheck: ids.map(item),
    refundsOwed: [],
    toCheckCount: ids.length,
    refundCount: 0,
    more: { toCheck: false, refunds: false },
    serverNow: "2026-10-30T09:00:00.000Z",
  }) as OnlineChecks;
const answer = (...ids: number[]) => ({ ok: true, data: checks(...ids) });

function setup(initial: OnlineChecks | null) {
  let listener: (() => void) | null = null;
  const subscribe = (next: () => void) => {
    listener = next;
    return () => {
      listener = null;
    };
  };
  const onNew = vi.fn();
  const hook = renderHook(() => useOnlineChecks({ initial, subscribe, onNew }));
  /** A read of the day landed on the staff board's channel. */
  const broadcast = async () => {
    await act(async () => {
      listener?.();
    });
  };
  return { ...hook, onNew, broadcast };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useOnlineChecks", () => {
  it("never toasts what was already waiting on the first load (AC-5)", async () => {
    refreshOnlineChecks.mockResolvedValue(answer(1, 2));
    const { onNew, broadcast } = setup(checks(1, 2));

    await broadcast();

    expect(onNew).not.toHaveBeenCalled();
  });

  it("hands on a booking new to To check once, and never again in this tab (AC-5)", async () => {
    const { onNew, broadcast } = setup(checks(1));

    refreshOnlineChecks.mockResolvedValueOnce(answer(1, 2));
    await broadcast();
    refreshOnlineChecks.mockResolvedValueOnce(answer(1, 2));
    await broadcast();
    refreshOnlineChecks.mockResolvedValueOnce(answer(1));
    await broadcast();
    refreshOnlineChecks.mockResolvedValueOnce(answer(1, 2));
    await broadcast();

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledWith(item(2));
  });

  it("treats its own first read as the first load when the server sent nothing (AC-5)", async () => {
    refreshOnlineChecks.mockResolvedValueOnce(answer(1, 2));
    const { result, onNew, broadcast } = setup(null);

    expect(result.current.load.state).toBe("loading");
    await waitFor(() => expect(result.current.load.state).toBe("loaded"));
    expect(onNew).not.toHaveBeenCalled();

    refreshOnlineChecks.mockResolvedValueOnce(answer(1, 2, 3));
    await broadcast();
    expect(onNew).toHaveBeenCalledExactlyOnceWith(item(3));
  });

  it("keeps a loaded list on screen when a later read fails (AC-2)", async () => {
    refreshOnlineChecks.mockResolvedValue({
      ok: false,
      error: { kind: "failed", message: "Try again." },
    });
    const { result, broadcast } = setup(checks(1));

    await broadcast();

    expect(result.current.load).toMatchObject({ state: "loaded", checks: checks(1) });
  });

  it("shows the failure when the list never loaded, and Try again reads again (AC-2)", async () => {
    refreshOnlineChecks.mockRejectedValueOnce(new Error("network"));
    const { result } = setup(null);

    await waitFor(() =>
      expect(result.current.load).toEqual({
        state: "failed",
        message: "The online bookings did not load.",
      }),
    );

    refreshOnlineChecks.mockResolvedValueOnce(answer(4));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.load.state).toBe("loaded"));
  });

  it("drops an older answer that lands after a newer one", async () => {
    let finishOld: (value: unknown) => void = () => {};
    refreshOnlineChecks.mockReturnValueOnce(new Promise((resolve) => (finishOld = resolve)));
    refreshOnlineChecks.mockResolvedValueOnce(answer(1, 2));
    const { result, broadcast } = setup(checks(1));

    await broadcast();
    await broadcast();
    await act(async () => finishOld(answer()));

    expect(result.current.load).toMatchObject({ checks: checks(1, 2) });
  });

  it("moves tick on every landed read, so an open sheet reads its booking again", async () => {
    refreshOnlineChecks.mockResolvedValue(answer(1));
    const { result, broadcast } = setup(checks(1));
    const before = result.current.tick;

    await broadcast();
    await broadcast();

    expect(result.current.tick).toBe(before + 2);
  });
});
