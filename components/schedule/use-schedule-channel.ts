"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ChannelStatus } from "@/components/live-indicator";
import { captureBrowserException } from "@/lib/analytics/browser";
import { boardHref } from "@/lib/schedule/board-day";
import type { Schedule } from "@/lib/schedule/queries";
import { BOARD_RETRY_DELAYS_MS, withQuietRetries } from "@/lib/schedule/quiet-retry";
import type { Database } from "@/lib/supabase/database.types";
import { formatDayHeading, todayInZone } from "@/lib/time";

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
 * It also owns which day is on screen (spec 0014). A day change is read here,
 * through the same transport, in the browser: no navigation, and the channel
 * stays joined. The gate is paused while that read is in flight, a failure
 * worth retrying is retried quietly, and only when the day lands does the
 * address follow it, replaced rather than pushed, so it never names a day
 * that is not on screen.
 *
 * Three events arrive on the `schedule` topic: a reservation, a court, or the
 * settings changed (spec 0007, AC-11). All three mean the same thing here, ask
 * again. When that read is refused because the day being shown has fallen past
 * the booking horizon, the board goes back to today (AC-12) instead of showing
 * a retry: it reads today in the browser, as a day change.
 */

/** The broadcast events the database sends on the `schedule` topic. */
export const SCHEDULE_EVENTS = [
  "reservation_changed",
  "court_changed",
  "settings_changed",
] as const;

/** What the board says when its day is no longer reachable. */
export const OUT_OF_RANGE_MESSAGE = "That day is no longer open for booking. Showing today.";

/** What a day change says when the day asked for is past the horizon (spec 0014, AC-6). */
export const PAST_WINDOW_MESSAGE = "That day is past the booking window.";

/**
 * One toast id for every failed reload, so the slow poll retrying against the
 * same fault updates a single notice instead of stacking a new one each time.
 * It is dismissed the moment a reload lands.
 */
export const RELOAD_FAILED_TOAST_ID = "schedule-reload-failed";

/** The same for a day change that could not land: one notice, replaced by the next. */
export const DAY_FAILED_TOAST_ID = "schedule-day-failed";

function reportReloadFailure(message: string) {
  // Our own messages end in a full stop; a raw database message does not.
  const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
  toast.error("The board could not reload", {
    id: RELOAD_FAILED_TOAST_ID,
    description: `${sentence} It still shows the day as it was before.`,
  });
}

function reportLimited(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1_000));
  toast.error(`Too many requests. Try again in ${seconds} seconds.`, { id: DAY_FAILED_TOAST_ID });
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
      /** Worth asking again: a dropped request or a server fault, never a refusal (spec 0014). */
      retry: boolean;
      retryAfterMs?: number;
      /** The day asked for is past the horizon: not an error, a reason to show today. */
      reason?: "out_of_range";
    };

/** Reads the day, or today when `date` is undefined. Never throws: a throw is a retryable failure. */
export type ScheduleTransport<T> = (date?: string) => Promise<TransportResult<T>>;

export type ScheduleListener<T> = (fresh: T) => void;

export type ScheduleChannelOptions<T extends Schedule> = {
  client: SupabaseClient<Database>;
  initial: T;
  /** The day the page was opened on, or undefined when it means today. Read once. */
  date?: string;
  transport: ScheduleTransport<T>;
  /** Runs before subscribing. Errors are logged; the subscribe still happens. */
  prepare?: () => Promise<void>;
  /** Re read the day this often while the channel is not live. Absent means never. */
  pollWhileDownMs?: number;
};

export type ScheduleChannelState<T extends Schedule> = {
  schedule: T;
  /** The day on screen as asked for, or undefined when the board means today (spec 0014, AC-9). */
  date?: string;
  /** The day a change is on its way to, while it is being read (spec 0014, AC-2). */
  pendingDate?: string;
  /** Move the board to another day, read in the browser (spec 0014, AC-1). */
  goToDay: (date: string) => void;
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
  /** Be told after every read of the same day that landed. Returns the unsubscribe. */
  subscribe: (listener: ScheduleListener<T>) => () => void;
};

export function useScheduleChannel<T extends Schedule>({
  client,
  initial,
  date: initialDate,
  transport,
  prepare,
  pollWhileDownMs,
}: ScheduleChannelOptions<T>): ScheduleChannelState<T> {
  const [schedule, setSchedule] = useState(initial);
  const [date, setDate] = useState(initialDate);
  const [pendingDate, setPendingDate] = useState<string | undefined>(undefined);
  const [refetchError, setRefetchError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<ChannelStatus>("CLOSED");
  const [waiting, setWaiting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());

  // Reads can overlap (a broadcast during a board's own write, a tap during a
  // re read, a second tap). Only the newest answer may land, or an older day
  // could paint over a newer one.
  const generation = useRef(0);

  // The day asked for and the schedule on screen, for callbacks that must
  // see what landed the moment it landed, not a render later.
  const dateRef = useRef(initialDate);
  const scheduleRef = useRef(initial);
  // Set while a day change is being read: every other read waits for it (AC-8).
  const dayReading = useRef(false);
  // The `date` this hook last put in the address, so its own writes are told
  // apart from a navigation.
  const written = useRef(initialDate);
  const gate = useRef<ReadGate | null>(null);

  // The providers are no longer keyed on the day (spec 0014), so a fresh
  // server render of the same page (a link to the board it is on, a
  // `router.refresh()`) arrives as a new `initial`. It wins, as a remount did.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setSchedule(initial);
    setDate(initialDate);
    setPendingDate(undefined);
  }
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);
  useEffect(() => {
    // Nothing read for the page before it was rendered again may land on it.
    generation.current += 1;
    if (dayReading.current) {
      dayReading.current = false;
      gate.current?.resume();
    }
  }, [initial]);

  const listeners = useRef(new Set<ScheduleListener<T>>());
  const subscribe = useCallback((listener: ScheduleListener<T>) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const land = useCallback((fresh: T) => {
    scheduleRef.current = fresh;
    setSchedule(fresh);
    setRefetchError(null);
    toast.dismiss(RELOAD_FAILED_TOAST_ID);
    setLastUpdatedAt(Date.now());
  }, []);

  /** During a `429` wait a day change is refused at once: asking would only spend more (AC-6). */
  const refusedByWait = useCallback(() => {
    const waitEndsAt = gate.current?.waitEndsAt ?? null;
    if (waitEndsAt === null) return false;
    reportLimited(waitEndsAt - Date.now());
    return true;
  }, []);

  /**
   * Read `requested` (undefined for today) as a day change, showing `shown` in
   * the heading meanwhile. Spec 0014, AC-1 to AC-8.
   */
  const changeDay = useCallback(
    // Named, so the Try again action can repeat this same change by name.
    async function change(requested: string | undefined, shown: string): Promise<void> {
      const mine = ++generation.current;
      dayReading.current = true;
      setPendingDate(shown);
      // A tap is a person asking, not a burst to coalesce: it goes around the
      // window and the floor, but counts for the floor, and holds the gate.
      gate.current?.pause();
      gate.current?.markRead();

      const outcome = await withQuietRetries(
        async () => {
          try {
            return await transport(requested);
          } catch (error) {
            const message = error instanceof Error ? error.message : "The day did not load.";
            return { ok: false as const, message, retry: true };
          }
        },
        { delaysMs: BOARD_RETRY_DELAYS_MS, cancelled: () => mine !== generation.current },
      );
      // A newer tap took over; it owns the pending state and the gate now.
      if (outcome.cancelled) return;

      const { result } = outcome;
      dayReading.current = false;
      setPendingDate(undefined);

      if (result.ok) {
        // Per day state resets by `DayBoundary` below the hook, so listeners
        // (which reconcile the same day's sheets) are not told of another day.
        dateRef.current = requested;
        setDate(requested);
        land(result.data);
        toast.dismiss(DAY_FAILED_TOAST_ID);
        // Only now, so the address never names a day that is not on screen (AC-4).
        written.current = requested;
        window.history.replaceState(null, "", boardHref(window.location.href, requested));
        gate.current?.resume();
        return;
      }

      // Snap back: the day on screen stays, honest about which day it is.
      if (result.retryAfterMs !== undefined) {
        gate.current?.wait(result.retryAfterMs);
        setWaiting(true);
        gate.current?.resume();
        // One read when the wait ends, which is what clears the waiting state.
        gate.current?.request();
        reportLimited(result.retryAfterMs);
        return;
      }
      gate.current?.resume();
      if (result.reason === "out_of_range") {
        toast.error(PAST_WINDOW_MESSAGE, { id: DAY_FAILED_TOAST_ID });
        return;
      }
      if (!result.retry) {
        toast.error(result.message, { id: DAY_FAILED_TOAST_ID });
        return;
      }
      console.error("schedule: day change failed", shown, result.message);
      captureBrowserException(new Error(`Day change to ${shown} failed: ${result.message}`));
      toast.error(`Couldn't load ${formatDayHeading(shown)}.`, {
        id: DAY_FAILED_TOAST_ID,
        action: {
          label: "Try again",
          onClick: () => {
            if (!refusedByWait()) void change(requested, shown);
          },
        },
      });
    },
    [transport, land, refusedByWait],
  );

  /** Venue today, from the server's stamp on the schedule on screen (spec 0006, AC-4). */
  const venueToday = useCallback(() => {
    const { grid, now } = scheduleRef.current;
    return todayInZone(grid.timezone, new Date(now));
  }, []);

  const goToDay = useCallback(
    (to: string) => {
      if (refusedByWait()) return;
      // Today is asked for undated, so the board goes on following midnight (AC-9).
      void changeDay(to === venueToday() ? undefined : to, to);
    },
    [changeDay, venueToday, refusedByWait],
  );

  // A link to the board it is on (the staff menu's `/staff` from a dated day)
  // is a navigation Next may answer with the page it first rendered, so no
  // fresh `initial` arrives. The address still changes: a `date` this hook
  // did not write means somebody navigated, so that day is read here.
  const urlDate = useSearchParams().get("date") ?? undefined;
  useEffect(() => {
    if (urlDate === written.current) return;
    written.current = urlDate;
    if (urlDate === dateRef.current) return;
    void changeDay(urlDate, urlDate ?? venueToday());
  }, [urlDate, changeDay, venueToday]);

  const refetch = useCallback(async () => {
    if (dayReading.current) {
      // A day is on its way; this read waits for it and asks for that day (AC-8).
      gate.current?.request();
      return null;
    }
    const mine = ++generation.current;
    try {
      const result = await transport(dateRef.current);
      if (mine !== generation.current) return null;
      if (!result.ok) {
        if (result.reason === "out_of_range") {
          // Never the retry state: the day is gone for good, so show today,
          // read in the browser like any day change (spec 0014, AC-11).
          toast.info(OUT_OF_RANGE_MESSAGE);
          void changeDay(undefined, venueToday());
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
      land(result.data);
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
  }, [transport, land, changeDay, venueToday]);

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
    date,
    pendingDate,
    goToDay,
    refetchError,
    channelStatus: waiting ? "TIMED_OUT" : socketStatus,
    lastUpdatedAt,
    requestRead,
    refetch,
    subscribe,
  };
}
