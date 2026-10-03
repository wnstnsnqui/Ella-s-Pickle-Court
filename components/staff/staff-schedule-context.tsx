"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DayBoundary } from "@/components/schedule/day-boundary";
import { formatRunForToast } from "@/lib/online-checks/format";
import type { OnlineCheckItem, OnlineChecks } from "@/lib/online-checks/types";
import type { StaffSchedule } from "@/lib/schedule/queries";
import type { StaffRole } from "@/lib/staff";

import { useOnlineChecks, type OnlineChecksState } from "./use-online-checks";
import { useStaffSchedule, type StaffScheduleState } from "./use-staff-schedule";

/**
 * The one live schedule the staff page shares. Spec 0005.
 *
 * The page is a server component with two client regions that need the same
 * state: the toolbar under the brand band (day navigation and the live
 * indicator) and the board itself. A context lets both read one `useStaffSchedule`
 * without the shell knowing anything about it. The day is the hook's (spec
 * 0014): a day change is read in the browser, and `DayBoundary` gives each
 * landed day a fresh board body (selection, pending and failed cells, sheets)
 * while the provider and its channel stay mounted.
 *
 * Spec 0016 adds the staff check beside it: the chip and the list's data, the
 * new booking toast, and which online booking is open in its own sheet (from
 * the list, a code search or the toast), whatever day the board is on.
 */

export type StaffViewer = {
  /** The user id, so the board can tell its own rows from everybody else's. */
  userId: string;
  role: StaffRole;
};

type StaffBoardContext = StaffScheduleState & {
  viewer: StaffViewer;
  /** A day change is on its way, so the board can dim while it lands. */
  dayNavPending: boolean;
  checks: OnlineChecksState;
  /** The online booking open in its own sheet, or null. */
  openBookingId: number | null;
  openBooking: (bookingId: number) => void;
  closeBooking: () => void;
};

const Context = createContext<StaffBoardContext | null>(null);

export function StaffScheduleProvider({
  initial,
  initialChecks,
  date,
  viewer,
  children,
}: {
  initial: StaffSchedule;
  /** The chip and list as the server read them, or null when that read failed. */
  initialChecks: OnlineChecks | null;
  /** The date in the URL the page was opened on, or undefined for today. */
  date?: string;
  viewer: StaffViewer;
  children: React.ReactNode;
}) {
  const state = useStaffSchedule(initial, date);
  const [openBookingId, setOpenBookingId] = useState<number | null>(null);
  const openBooking = useCallback((bookingId: number) => setOpenBookingId(bookingId), []);
  const closeBooking = useCallback(() => setOpenBookingId(null), []);

  const timeZone = useRef(state.schedule.grid.timezone);
  useEffect(() => {
    timeZone.current = state.schedule.grid.timezone;
  }, [state.schedule.grid.timezone]);

  // AC-5: no sound, and the same booking never toasts twice in one tab.
  const onNew = useCallback(
    (item: OnlineCheckItem) => {
      const first = item.runs[0];
      toast(
        first
          ? `New online booking to check: ${formatRunForToast(first, timeZone.current)}`
          : "New online booking to check",
        {
          id: `online-booking-${item.bookingId}`,
          action: { label: "Open", onClick: () => openBooking(item.bookingId) },
        },
      );
    },
    [openBooking],
  );

  const { subscribe } = state;
  const subscribeAny = useCallback(
    (listener: () => void) => subscribe(() => listener()),
    [subscribe],
  );
  const checks = useOnlineChecks({ initial: initialChecks, subscribe: subscribeAny, onNew });

  return (
    <Context.Provider
      value={{
        ...state,
        viewer,
        dayNavPending: state.pendingDate !== undefined,
        checks,
        openBookingId,
        openBooking,
        closeBooking,
      }}
    >
      <DayBoundary date={state.schedule.grid.date}>{children}</DayBoundary>
    </Context.Provider>
  );
}

export function useStaffBoard(): StaffBoardContext {
  const value = useContext(Context);
  if (!value) throw new Error("useStaffBoard needs a StaffScheduleProvider above it.");
  return value;
}
