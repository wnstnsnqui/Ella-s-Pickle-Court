"use client";

import { createContext, useContext } from "react";

import { DayBoundary } from "@/components/schedule/day-boundary";
import type { StaffSchedule } from "@/lib/schedule/queries";
import type { StaffRole } from "@/lib/staff";

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
};

const Context = createContext<StaffBoardContext | null>(null);

export function StaffScheduleProvider({
  initial,
  date,
  viewer,
  children,
}: {
  initial: StaffSchedule;
  /** The date in the URL the page was opened on, or undefined for today. */
  date?: string;
  viewer: StaffViewer;
  children: React.ReactNode;
}) {
  const state = useStaffSchedule(initial, date);
  return (
    <Context.Provider value={{ ...state, viewer, dayNavPending: state.pendingDate !== undefined }}>
      <DayBoundary date={state.schedule.grid.date}>{children}</DayBoundary>
    </Context.Provider>
  );
}

export function useStaffBoard(): StaffBoardContext {
  const value = useContext(Context);
  if (!value) throw new Error("useStaffBoard needs a StaffScheduleProvider above it.");
  return value;
}
