"use client";

import { useEffect } from "react";

import { captureDayViewed } from "@/lib/analytics/browser";
import { VENUE_TIMEZONE } from "@/lib/env";
import { daysBetween, todayInZone } from "@/lib/time";

/**
 * Fires `board_day_viewed` once per shown day. Spec 0009, AC-2.
 *
 * `app/page.tsx` keys `PublicScheduleProvider` on `grid.date`, so this
 * component fully remounts on a date change (whether from day navigation or a
 * fresh visit), giving one capture per shown day: on first paint, and again
 * only when the day actually changes.
 */
export function BoardDayViewed({ date }: { date: string }) {
  useEffect(() => {
    captureDayViewed(daysBetween(todayInZone(VENUE_TIMEZONE), date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
