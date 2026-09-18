"use client";

import { createContext, useContext, useState } from "react";

import type { StaffSchedule } from "@/lib/schedule/queries";
import type { StaffRole } from "@/lib/staff";

import { useStaffSchedule, type StaffScheduleState } from "./use-staff-schedule";

/**
 * The one live schedule the staff page shares. Spec 0005.
 *
 * The page is a server component with two client regions that need the same
 * state: the toolbar under the brand band (day navigation and the live
 * indicator) and the board itself. A context lets both read one `useStaffSchedule`
 * without the shell knowing anything about it. The provider is keyed on the date
 * by the page, so moving to another day starts fresh from that day's server render.
 */

export type StaffViewer = {
  /** The Clerk id, so the board can tell its own rows from everybody else's. */
  clerkUserId: string;
  role: StaffRole;
};

type StaffBoardContext = StaffScheduleState & {
  date: string;
  viewer: StaffViewer;
  /** A prev/next day tap is on its way, so the board can dim while it lands. */
  dayNavPending: boolean;
  setDayNavPending: (pending: boolean) => void;
};

const Context = createContext<StaffBoardContext | null>(null);

export function StaffScheduleProvider({
  initial,
  date,
  viewer,
  children,
}: {
  initial: StaffSchedule;
  date: string;
  viewer: StaffViewer;
  children: React.ReactNode;
}) {
  const state = useStaffSchedule(initial, date);
  const [dayNavPending, setDayNavPending] = useState(false);
  return (
    <Context.Provider value={{ ...state, date, viewer, dayNavPending, setDayNavPending }}>
      {children}
    </Context.Provider>
  );
}

export function useStaffBoard(): StaffBoardContext {
  const value = useContext(Context);
  if (!value) throw new Error("useStaffBoard needs a StaffScheduleProvider above it.");
  return value;
}
