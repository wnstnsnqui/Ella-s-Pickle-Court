"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChannelStatus } from "@/components/live-indicator";
import { refreshStaffSchedule } from "@/lib/schedule/actions";
import type { StaffSchedule } from "@/lib/schedule/queries";
import { staffBrowserSupabase } from "@/lib/supabase/staff-browser";

/**
 * The day, kept honest. Spec 0005, AC-10 and invariant 4.
 *
 * One hook owns the schedule the board renders, the refetch that replaces it
 * whole, and the private `schedule` channel that triggers a refetch on every
 * broadcast. The payload is never used to patch a cell: the broadcast is only
 * a nudge to ask the server again, so a tab that missed a message still
 * corrects itself on the next one, and a tab whose channel is down still
 * corrects itself after its own writes.
 *
 * The token is Clerk's, applied with `realtime.setAuth()` before subscribing
 * and again whenever Clerk hands out a fresh one. Clerk keeps the current token
 * cached client side and rotates it about once a minute, so the hook asks for
 * it on a timer and re applies only when the string changed; the socket is
 * never rebuilt. A `setAuth()` that throws is logged, the channel keeps the
 * token it had, and the next tick tries again.
 */

/** How often to ask Clerk for the token. Under its rotation period on purpose. */
const TOKEN_CHECK_MS = 45_000;

export type StaffScheduleState = {
  schedule: StaffSchedule;
  /** Whether the latest refetch failed, with the message to show. */
  refetchError: string | null;
  channelStatus: ChannelStatus;
  /** Client clock at the last good schedule. */
  lastUpdatedAt: number;
  /** Ask the server for the day again. Resolves with the fresh schedule, or null on failure. */
  refetch: () => Promise<StaffSchedule | null>;
  /** Be told after every refetch that landed. Returns the unsubscribe. */
  subscribe: (listener: ScheduleListener) => () => void;
};

export type ScheduleListener = (fresh: StaffSchedule) => void;

export function useStaffSchedule(initial: StaffSchedule, date: string): StaffScheduleState {
  const { getToken } = useAuth();
  const [schedule, setSchedule] = useState(initial);
  const [refetchError, setRefetchError] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>("CLOSED");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now());

  // Refetches can overlap (a broadcast during our own write). Only the newest
  // answer may land, or an older day could paint over a newer one.
  const generation = useRef(0);

  // Who wants to know when the day changed under them: the board, which prunes
  // its selection against every fresh grid. A listener rather than an effect
  // on the schedule, so the reaction is an event with a cause, not a render.
  const listeners = useRef(new Set<ScheduleListener>());
  const subscribe = useCallback((listener: ScheduleListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const refetch = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const result = await refreshStaffSchedule({ date });
      if (mine !== generation.current) return null;
      if (!result.ok) {
        setRefetchError(result.error.message);
        return null;
      }
      setSchedule(result.data);
      setRefetchError(null);
      setLastUpdatedAt(Date.now());
      for (const listener of listeners.current) listener(result.data);
      return result.data;
    } catch (error) {
      if (mine === generation.current) {
        setRefetchError(error instanceof Error ? error.message : "The schedule did not reload.");
      }
      return null;
    }
  }, [date]);

  // Keep the newest refetch in a ref so the channel effect never has to resubscribe.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const supabase = staffBrowserSupabase();
    let cancelled = false;
    let applied: string | null = null;

    const applyToken = async () => {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch (error) {
        console.error("staff schedule: could not read the Clerk token", error);
        return;
      }
      if (cancelled || !token || token === applied) return;
      try {
        await supabase.realtime.setAuth(token);
        applied = token;
      } catch (error) {
        // Keep the token the channel already has; the next tick tries again.
        console.error("staff schedule: realtime.setAuth() failed", error);
      }
    };

    const channel = supabase.channel("schedule", { config: { private: true } });

    (async () => {
      await applyToken();
      if (cancelled) return;
      channel
        .on("broadcast", { event: "reservation_changed" }, () => {
          void refetchRef.current();
        })
        .subscribe((status) => {
          if (cancelled) return;
          setChannelStatus(status);
          // A channel that came back may have missed something while it was away.
          if (status === "SUBSCRIBED") void refetchRef.current();
        });
    })();

    const timer = setInterval(() => void applyToken(), TOKEN_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void applyToken();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [getToken]);

  return { schedule, refetchError, channelStatus, lastUpdatedAt, refetch, subscribe };
}
