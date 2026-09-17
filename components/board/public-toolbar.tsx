"use client";

import { DayNav } from "@/components/day-nav";
import { cn } from "@/lib/utils";

import { usePublicBoard } from "./public-schedule-context";

/** Which day the board shows, sized to its own content rather than the row. */
export function PublicToolbar({ className }: { className?: string }) {
  const { schedule } = usePublicBoard();
  return (
    <DayNav
      date={schedule.grid.date}
      timezone={schedule.grid.timezone}
      horizonDays={schedule.horizonDays}
      now={schedule.now}
      className={cn("w-fit", className)}
    />
  );
}
