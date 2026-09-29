"use client";

import { createContext, useContext, useEffect } from "react";

import { DayBoundary } from "@/components/schedule/day-boundary";
import { boardTitle } from "@/lib/schedule/board-day";
import type { Schedule } from "@/lib/schedule/queries";

import { usePublicSchedule, type PublicScheduleState } from "./use-public-schedule";

/**
 * The one live schedule the public page shares. Spec 0006.
 *
 * Same shape as the staff board's context: the page is a server component with
 * two client regions that need the same state, the toolbar (day navigation and
 * the live indicator) and the board. The day is the hook's (spec 0014): a day
 * change is read in the browser, and `DayBoundary` gives each landed day a
 * fresh board body while the provider and its channel stay mounted.
 */

type PublicBoardContext = PublicScheduleState & {
  /** A day change is on its way, so the board can dim while it lands. */
  dayNavPending: boolean;
};

const Context = createContext<PublicBoardContext | null>(null);

export function PublicScheduleProvider({
  initial,
  requestedDate,
  children,
}: {
  initial: Schedule;
  /** The date in the URL the page was opened on, or undefined for today (AC-10). */
  requestedDate?: string;
  children: React.ReactNode;
}) {
  const state = usePublicSchedule(initial, requestedDate);
  const { date, schedule } = state;

  // The tab names the day on screen, the same text `generateMetadata` gives
  // that address on a reload (spec 0014, AC-10).
  useEffect(() => {
    document.title = boardTitle(date === undefined ? undefined : schedule.grid.date);
  }, [date, schedule.grid.date]);

  return (
    <Context.Provider value={{ ...state, dayNavPending: state.pendingDate !== undefined }}>
      <DayBoundary date={schedule.grid.date}>{children}</DayBoundary>
    </Context.Provider>
  );
}

export function usePublicBoard(): PublicBoardContext {
  const value = useContext(Context);
  if (!value) throw new Error("usePublicBoard needs a PublicScheduleProvider above it.");
  return value;
}
