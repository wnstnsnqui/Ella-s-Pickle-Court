"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useScheduleChannel,
  type ScheduleChannelState,
  type ScheduleTransport,
} from "@/components/schedule/use-schedule-channel";
import { refreshStaffSchedule } from "@/lib/schedule/actions";
import type { StaffSchedule } from "@/lib/schedule/queries";
import { staffBrowserSupabase } from "@/lib/supabase/staff-browser";

/**
 * The staff board's listener. Spec 0005, AC-10 and invariant 4.
 *
 * The channel, the read gate and the generation guard live in
 * `useScheduleChannel` (spec 0006, AC-13). What is left here is the staff
 * half: the Clerk token, applied with `realtime.setAuth()` before subscribing
 * and again whenever Clerk hands out a fresh one, and the Server Action that
 * reads the day as the signed in staff member.
 *
 * Clerk keeps the current token cached client side and rotates it about once
 * a minute, so the hook asks for it on a timer and re applies only when the
 * string changed; the socket is never rebuilt. A `setAuth()` that throws is
 * logged, the channel keeps the token it had, and the next tick tries again.
 */

/** How often to ask Clerk for the token. Under its rotation period on purpose. */
const TOKEN_CHECK_MS = 45_000;

export type StaffScheduleState = ScheduleChannelState<StaffSchedule>;
export type ScheduleListener = (fresh: StaffSchedule) => void;

export function useStaffSchedule(initial: StaffSchedule, date: string): StaffScheduleState {
  const { getToken } = useAuth();
  const client = useMemo(() => staffBrowserSupabase(), []);

  const applied = useRef<string | null>(null);
  const applyToken = useCallback(async () => {
    let token: string | null = null;
    try {
      token = await getToken();
    } catch (error) {
      console.error("staff schedule: could not read the Clerk token", error);
      return;
    }
    if (!token || token === applied.current) return;
    try {
      await client.realtime.setAuth(token);
      applied.current = token;
    } catch (error) {
      // Keep the token the channel already has; the next tick tries again.
      console.error("staff schedule: realtime.setAuth() failed", error);
    }
  }, [client, getToken]);

  const transport = useCallback<ScheduleTransport<StaffSchedule>>(async (day) => {
    const result = await refreshStaffSchedule({ date: day });
    if (result.ok) return { ok: true, data: result.data };
    return {
      ok: false,
      message: result.error.message,
      // The day fell past the horizon (spec 0007, AC-12): the hook shows today.
      reason:
        result.error.kind === "invalid" && result.error.reason === "out_of_range"
          ? "out_of_range"
          : undefined,
    };
  }, []);

  const state = useScheduleChannel<StaffSchedule>({
    client,
    initial,
    date,
    transport,
    prepare: applyToken,
  });

  useEffect(() => {
    const timer = setInterval(() => void applyToken(), TOKEN_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void applyToken();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [applyToken]);

  return state;
}
