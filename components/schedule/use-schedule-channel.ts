"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ChannelStatus } from "@/components/live-indicator";
import type { Schedule } from "@/lib/schedule/queries";
import type { Database } from "@/lib/supabase/database.types";

import { ReadGate } from "./read-gate";

/**
 * The day, kept honest, for both boards. Spec 0006, AC-13 (and spec 0005, AC-10).
 *
 * One hook owns the schedule a board renders, the read that replaces it whole,
 * the private `schedule` channel that triggers a read on every broadcast, and
 * the gate that decides when a read may start. The broadcast payload is never
 * used to patch a cell: it is only a nudge to ask the server again, so a tab
 * that missed a message still corrects itself on the next one.
 *
 * What differs between the boards is handed in: which Supabase client, the
 * `prepare` step run before subscribing (a bare
 * `realtime.setAuth()` for the public), and the transport that fetches the day.
 *
 * Three events arrive on the `schedule` topic: a reservation, a court, or the
 * settings changed (spec 0007, AC-11). All three mean the same thing here, ask
 * again. When that read is refused because the day being shown has fallen past
 * the booking horizon, the board goes back to today (AC-12) instead of showing
 * a retry: it drops the `date` from its URL, which renders today's board fresh.
 */

/** The broadcast events the database sends on the `schedule` topic. */
export const SCHEDULE_EVENTS = [
  "reservation_changed",
  "court_changed",
  "settings_changed",
] as const;

/** What the board says when its day is no longer reachable. */
export const OUT_OF_RANGE_MESSAGE = "That day is no longer open for booking. Showing today.";

/**
 * One toast id for every failed reload, so the slow poll retrying against the
 * same fault updates a single notice instead of stacking a new one each time.
 * It is dismissed the moment a reload lands.
 */
export const RELOAD_FAILED_TOAST_ID = "schedule-reload-failed";

function reportReloadFailure(message: string) {
  // Our own messages end in a full stop; a raw database message does not.
  const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
  toast.error("The board could not reload", {
    id: RELOAD_FAILED_TOAST_ID,
    description: `${sentence} It still shows the day as it was before.`,
  });
}

/** How long to gather broadcasts before one read. */
export const COALESCE_MS = 300;
/** The least time between two reads starting in one tab. */
export const READ_FLOOR_MS = 2_000;
/** The wait after a `429` that carried no `Retry-After`. */
export const DEFAULT_RETRY_AFTER_MS = 5_000;

export type TransportResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      retryAfterMs?: number;
      /** The day asked for is past the horizon: not an error, a reason to show today. */
      reason?: "out_of_range";
    };

export type ScheduleTransport<T> = (date?: string) => Promise<TransportResult<T>>;

export type ScheduleListener<T> = (fresh: T) => void;

export type ScheduleChannelOptions<T extends Schedule> = {
  client: SupabaseClient<Database>;
  initial: T;
  /** The day the page was opened on, or undefined when it means today. */
  date?: string;
  transport: ScheduleTransport<T>;
  /** Runs before subscribing. Errors are logged; the subscribe still happens. */
  prepare?: () => Promise<void>;
  /** Re read the day this often while the channel is not live. Absent means never. */
  pollWhileDownMs?: number;
};

export type ScheduleChannelState<T extends Schedule> = {
  schedule: T;
  /** Whether the latest read failed, with the message to show. */
  refetchError: string | null;
  /**
   * The channel state for the live indicator. While a `429` wait holds reads
   * the board is not being kept current, so it reads as `TIMED_OUT` even when
   * the socket itself is fine.
   */
  channelStatus: ChannelStatus;
  /** Client clock at the last good schedule. */
  lastUpdatedAt: number;
  /** Ask for a read through the gate: coalesced, floored, held during a wait. */
  requestRead: () => void;
  /** Read now, outside the gate, and resolve with the fresh schedule or null. For a board's own writes. */
  refetch: () => Promise<T | null>;
  /** Be told after every read that landed. Returns the unsubscribe. */
  subscribe: (listener: ScheduleListener<T>) => () => void;
};

export function useScheduleChannel<T extends Schedule>({
  client,
  initial,
  date,
  transport,
  prepare,
  pollWhileDownMs,
}: ScheduleChannelOptions<T>): ScheduleChannelState<T> {
  const [schedule, setSchedule] = useState(initial);
  const [refetchError, setRefetchError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<ChannelStatus>("CLOSED");
  const [waiting, setWaiting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());
  const router = useRouter();
  const pathname = usePathname();

  // Reads can overlap (a broadcast during a board's own write). Only the newest
  // answer may land, or an older day could paint over a newer one.
  const generation = useRef(0);

  const listeners = useRef(new Set<ScheduleListener<T>>());
  const subscribe = useCallback((listener: ScheduleListener<T>) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const gate = useRef<ReadGate | null>(null);

  const refetch = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const result = await transport(date);
      if (mine !== generation.current) return null;
      if (!result.ok) {
        if (result.reason === "out_of_range") {
          // Never the retry state: the day is gone for good, so show today.
          toast.info(OUT_OF_RANGE_MESSAGE);
          router.replace(pathname);
          return null;
        }
        setRefetchError(result.message);
        reportReloadFailure(result.message);
        if (result.retryAfterMs !== undefined) {
          gate.current?.wait(result.retryAfterMs);
          setWaiting(true);
        }
        return null;
      }
      setSchedule(result.data);
      setRefetchError(null);
      toast.dismiss(RELOAD_FAILED_TOAST_ID);
      setLastUpdatedAt(Date.now());
      for (const listener of listeners.current) listener(result.data);
      return result.data;
    } catch (error) {
      if (mine === generation.current) {
        const message = error instanceof Error ? error.message : "The schedule did not reload.";
        setRefetchError(message);
        reportReloadFailure(message);
      }
      return null;
    }
  }, [transport, date, router, pathname]);

  // Keep the newest read in a ref so the channel effect never has to resubscribe.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const requestRead = useCallback(() => {
    gate.current?.request();
  }, []);

  useEffect(() => {
    const current = new ReadGate(
      () => {
        setWaiting(false);
        void refetchRef.current();
      },
      { windowMs: COALESCE_MS, floorMs: READ_FLOOR_MS },
    );
    gate.current = current;
    return () => {
      current.dispose();
      if (gate.current === current) gate.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const channel = client.channel("schedule", { config: { private: true } });

    (async () => {
      if (prepare) {
        try {
          await prepare();
        } catch (error) {
          console.error("schedule channel: prepare failed", error);
        }
      }
      if (cancelled) return;
      for (const event of SCHEDULE_EVENTS) {
        channel.on("broadcast", { event }, () => {
          gate.current?.request();
        });
      }
      channel.subscribe((status) => {
        if (cancelled) return;
        setSocketStatus(status);
        // A channel that came back may have missed something while it was away.
        if (status === "SUBSCRIBED") gate.current?.request();
      });
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") gate.current?.request();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void client.removeChannel(channel);
    };
    // `prepare` is read once at subscribe time on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // The slow poll, on exactly while the socket is not live (AC-6).
  useEffect(() => {
    if (pollWhileDownMs === undefined || socketStatus === "SUBSCRIBED") return;
    const timer = setInterval(() => gate.current?.request(), pollWhileDownMs);
    return () => clearInterval(timer);
  }, [pollWhileDownMs, socketStatus]);

  return {
    schedule,
    refetchError,
    channelStatus: waiting ? "TIMED_OUT" : socketStatus,
    lastUpdatedAt,
    requestRead,
    refetch,
    subscribe,
  };
}
