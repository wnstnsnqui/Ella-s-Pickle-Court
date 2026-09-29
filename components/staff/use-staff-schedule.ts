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

import { staffTransportThrew, toStaffTransportResult } from "./staff-transport";

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

/** `date` is where the board starts, undefined for today; the hook owns the day after that. */
export function useStaffSchedule(initial: StaffSchedule, date?: string): StaffScheduleState {
  const client = useMemo(() => browserSupabase(), []);

  // Which failures are worth a quiet retry lives in `staff-transport.ts` (spec 0014).
  const transport = useCallback<ScheduleTransport<StaffSchedule>>(async (day) => {
    try {
      return toStaffTransportResult(await refreshStaffSchedule({ date: day }));
    } catch (error) {
      return staffTransportThrew(error);
    }
  }, []);

  return useScheduleChannel<StaffSchedule>({ client, initial, date, transport });
}
