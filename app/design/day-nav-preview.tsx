"use client";

import { useState } from "react";

import { DayNav } from "@/components/day-nav";

/**
 * `DayNav` on local state, for the gallery. Since spec 0014 the board owns
 * the day, so a preview has to own one too; here a pick simply lands at once.
 */
export function DayNavPreview({
  date,
  timezone,
  horizonDays,
}: {
  date: string;
  timezone: string;
  horizonDays: number;
}) {
  const [shown, setShown] = useState(date);
  return (
    <DayNav date={shown} onNavigate={setShown} timezone={timezone} horizonDays={horizonDays} />
  );
}
