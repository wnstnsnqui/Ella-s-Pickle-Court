"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_RETRY_AFTER_MS,
  useScheduleChannel,
  type ScheduleChannelState,
  type ScheduleTransport,
  type TransportResult,
} from "@/components/schedule/use-schedule-channel";
import type { Schedule } from "@/lib/schedule/queries";
import { browserSupabase } from "@/lib/supabase/browser";
import { calendarDateInZone } from "@/lib/time";

/**
 * The public board's listener. Spec 0006, AC-5, AC-6, AC-9 and AC-10.
 *
 * The anonymous client, a `prepare` of `realtime.setAuth()` with no argument
 * (what lets the `realtime.messages` policy be evaluated for anon at join
 * time), the JSON transport against `GET /api/schedule`, and the slow poll
 * while the channel is not live. Everything else is `useScheduleChannel`.
 *
 * The clock is the server's: `schedule.now` is the stamp at the read, and this
 * hook only ever adds elapsed time to it, once a minute. On a board opened
 * without a date, the tick also notices the venue's day rolling over and asks
 * for one read, which is the only way a quiet night ever moves the board on.
 */

/** Re read the day this often while the channel is not live (AC-6). */
export const POLL_WHILE_DOWN_MS = 60_000;
/** How often the board's clock moves. */
const TICK_MS = 60_000;

export type PublicScheduleState = ScheduleChannelState<Schedule> & {
  /** The board's clock as a UTC instant in ms: the server stamp plus elapsed time. */
  now: number;
};

export const publicTransport: ScheduleTransport<Schedule> = async (date) => {
  const url = date ? `/api/schedule?date=${encodeURIComponent(date)}` : "/api/schedule";
  const response = await fetch(url, { cache: "no-store" });

  if (response.status === 429) {
    const header = Number(response.headers.get("Retry-After"));
    const retryAfterMs =
      Number.isFinite(header) && header > 0 ? header * 1_000 : DEFAULT_RETRY_AFTER_MS;
    return {
      ok: false,
      message: "Too many requests. The board will catch up shortly.",
      retryAfterMs,
    };
  }

  let body:
    TransportResult<Schedule> | { ok: false; error?: { message?: string; reason?: string } };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { ok: false, message: `The schedule did not reload (${response.status}).` };
  }

  if (body.ok) return { ok: true, data: body.data };
  const message =
    "error" in body && body.error?.message ? body.error.message : "The schedule did not reload.";
  // A `422` whose reason is the horizon (spec 0007, AC-12) is handed on as such.
  const reason =
    response.status === 422 && "error" in body && body.error?.reason === "out_of_range"
      ? ("out_of_range" as const)
      : undefined;
  return { ok: false, message, reason };
};

export function usePublicSchedule(initial: Schedule, requestedDate?: string): PublicScheduleState {
  const client = useMemo(() => browserSupabase(), []);
  const prepare = useCallback(() => client.realtime.setAuth(), [client]);

  const state = useScheduleChannel<Schedule>({
    client,
    initial,
    date: requestedDate,
    transport: publicTransport,
    prepare,
    pollWhileDownMs: POLL_WHILE_DOWN_MS,
  });

  const { schedule, requestRead } = state;

  // The clock: the server stamp, plus one minute per tick this tab has held
  // it. Whole minutes, counted rather than measured, so the server render and
  // the first client paint compute the same instant. A background tab's timer
  // may run slow; every re read brings a fresh stamp, and coming back into
  // view triggers one.
  const [clock, setClock] = useState({ stamp: schedule.now, minutes: 0 });
  if (clock.stamp !== schedule.now) setClock({ stamp: schedule.now, minutes: 0 });

  useEffect(() => {
    const timer = setInterval(
      () => setClock((held) => ({ ...held, minutes: held.minutes + 1 })),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, []);

  const now = Date.parse(clock.stamp) + clock.minutes * TICK_MS;

  // Midnight at the venue (AC-10): an undated board means today, and today just moved.
  useEffect(() => {
    if (requestedDate !== undefined) return;
    if (calendarDateInZone(new Date(now), schedule.grid.timezone) !== schedule.grid.date) {
      requestRead();
    }
  }, [now, requestedDate, schedule.grid.date, schedule.grid.timezone, requestRead]);

  return { ...state, now };
}
