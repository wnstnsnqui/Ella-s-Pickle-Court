"use client";

import { Fragment } from "react";

/**
 * A fresh board body for every day that lands. Spec 0014, AC-7.
 *
 * A day change is read in the browser now, so nothing remounts on its own.
 * The provider renders its children inside this boundary, keyed on the day on
 * screen, so everything that belongs to one day (the staff selection, pending
 * and failed cells, an open sheet, the changed cell baseline, the one scroll
 * to now, the one `board_day_viewed`) starts fresh when a new day lands, while
 * the hook and its channel above it stay put.
 *
 * Anything new that belongs to a day must live under this key.
 */
export function DayBoundary({ date, children }: { date: string; children: React.ReactNode }) {
  return <Fragment key={date}>{children}</Fragment>;
}
