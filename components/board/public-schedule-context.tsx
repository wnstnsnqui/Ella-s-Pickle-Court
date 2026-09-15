"use client";

import { createContext, useContext } from "react";

import type { Schedule } from "@/lib/schedule/queries";

import { usePublicSchedule, type PublicScheduleState } from "./use-public-schedule";

/**
 * The one live schedule the public page shares. Spec 0006.
 *
 * Same shape as the staff board's context: the page is a server component with
 * two client regions that need the same state, the toolbar (day navigation and
 * the live indicator) and the board. The provider is keyed on the grid date by
 * the page, so a new day starts fresh from that day's server render.
 */

type PublicBoardContext = PublicScheduleState & {
  /** The date in the URL, or undefined when the page means today (AC-10). */
  requestedDate?: string;
};

const Context = createContext<PublicBoardContext | null>(null);

export function PublicScheduleProvider({
  initial,
  requestedDate,
  children,
}: {
  initial: Schedule;
  requestedDate?: string;
  children: React.ReactNode;
}) {
  const state = usePublicSchedule(initial, requestedDate);
  return <Context.Provider value={{ ...state, requestedDate }}>{children}</Context.Provider>;
}

export function usePublicBoard(): PublicBoardContext {
  const value = useContext(Context);
  if (!value) throw new Error("usePublicBoard needs a PublicScheduleProvider above it.");
  return value;
}
