"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { refreshOnlineChecks } from "@/lib/online-checks/actions";
import type { OnlineCheckItem, OnlineChecks } from "@/lib/online-checks/types";

/**
 * The chip and the list, kept current. Spec 0016, AC-1, AC-2 and AC-5.
 *
 * There is no channel of its own: the staff board's schedule channel already
 * reads the day again on every broadcast (`booking_changed` included), and
 * this refetches after each of those reads lands, so it is coalesced and
 * floored by the same gate. `tick` moves on every answer, which is how an
 * open booking sheet knows to read its booking again.
 *
 * A booking id that turns up in To check, never seen by this tab before and
 * not on the first load, is handed to `onNew` once. Staff never move a booking
 * into `pending_check`, so every such id is a player's.
 */

export type ChecksLoad =
  | { state: "loading" }
  | { state: "loaded"; checks: OnlineChecks; receivedAt: number }
  | { state: "failed"; message: string };

export type OnlineChecksState = {
  load: ChecksLoad;
  /** Moves on every landed read. */
  tick: number;
  refetch: () => Promise<void>;
  /** Try again after a failure: shows the loading state, then reads. */
  retry: () => void;
};

export function useOnlineChecks({
  initial,
  subscribe,
  onNew,
}: {
  initial: OnlineChecks | null;
  /** The schedule's "a read of the day landed" hook. */
  subscribe: (listener: () => void) => () => void;
  onNew: (item: OnlineCheckItem) => void;
}): OnlineChecksState {
  const [load, setLoad] = useState<ChecksLoad>(() =>
    initial ? { state: "loaded", checks: initial, receivedAt: Date.now() } : { state: "loading" },
  );
  const [tick, setTick] = useState(0);

  // Every id ever seen in To check by this tab, so none toasts twice.
  const seen = useRef<Set<number> | null>(
    initial ? new Set(initial.toCheck.map((item) => item.bookingId)) : null,
  );
  const generation = useRef(0);
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  /** Land one answer, unless a newer read has started since. */
  const apply = useCallback(
    (mine: number, result: Awaited<ReturnType<typeof refreshOnlineChecks>> | null) => {
      if (mine !== generation.current) return;
      if (!result || !result.ok) {
        const message = result ? result.error.message : "The online bookings did not load.";
        // A loaded list stays on screen; only a list that never loaded shows the failure.
        setLoad((current) => (current.state === "loaded" ? current : { state: "failed", message }));
        return;
      }
      const checks = result.data;
      if (seen.current === null) {
        seen.current = new Set(checks.toCheck.map((item) => item.bookingId));
      } else {
        for (const item of checks.toCheck) {
          if (seen.current.has(item.bookingId)) continue;
          seen.current.add(item.bookingId);
          onNewRef.current(item);
        }
      }
      setLoad({ state: "loaded", checks, receivedAt: Date.now() });
      setTick((n) => n + 1);
    },
    [],
  );

  const read = useCallback(() => {
    const mine = ++generation.current;
    return refreshOnlineChecks().then(
      (result) => apply(mine, result),
      () => apply(mine, null),
    );
  }, [apply]);

  const refetch = useCallback(async () => {
    await read();
  }, [read]);

  useEffect(() => {
    // The first answer is the server's, or this one read; after that, the channel drives.
    if (!initial) void read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => subscribe(() => void refetch()), [subscribe, refetch]);

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    void refetch();
  }, [refetch]);

  return { load, tick, refetch, retry };
}
