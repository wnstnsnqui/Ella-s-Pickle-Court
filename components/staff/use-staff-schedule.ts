"use client";

import { useCallback, useMemo } from "react";

import {
  useScheduleChannel,
  type ScheduleChannelState,
  type ScheduleTransport,
} from "@/components/schedule/use-schedule-channel";
import { refreshStaffSchedule } from "@/lib/schedule/actions";
import type { StaffSchedule } from "@/lib/schedule/queries";
import { browserSupabase } from "@/lib/supabase/browser";

/**
 * The staff board's listener. Spec 0005, AC-10 and invariant 4; spec 0004
 * (revised), AC-12.
 *
 * The channel, the read gate and the generation guard live in
 * `useScheduleChannel` (spec 0006, AC-13). What is left here is the staff
 * half, and since the Better Auth move it is only the transport: the Server
 * Action that reads the day as the signed in staff member, through their
 * session. The socket itself is the same anon browser client the public
 * board uses. The `schedule` topic carries no personal data and has been
 * readable by `anon` since spec 0002, so no token is applied and there is no
 * second client module.
 */

export type StaffScheduleState = ScheduleChannelState<StaffSchedule>;
export type ScheduleListener = (fresh: StaffSchedule) => void;

export function useStaffSchedule(initial: StaffSchedule, date: string): StaffScheduleState {
  const client = useMemo(() => browserSupabase(), []);

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

  return useScheduleChannel<StaffSchedule>({ client, initial, date, transport });
}
