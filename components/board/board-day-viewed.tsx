"use client";

import { useEffect } from "react";

import { captureDayViewed } from "@/lib/analytics/browser";
import { VENUE_TIMEZONE } from "@/lib/env";
import { daysBetween, todayInZone } from "@/lib/time";

import { usePublicBoard } from "./public-schedule-context";

/**
 * Fires `board_day_viewed` once per shown day. Spec 0009, AC-2.
 *
 * It sits inside the provider's `DayBoundary` (spec 0014, AC-7), which is
 * keyed on the day on screen, so this component mounts once per landed day,
 * on first paint and again only when a new day lands, never on a re read of
 * the same day.
 */
export function BoardDayViewed() {
  const { schedule } = usePublicBoard();
  const date = schedule.grid.date;
  useEffect(() => {
    captureDayViewed(daysBetween(todayInZone(VENUE_TIMEZONE), date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
