"use client";

import { DayNav } from "@/components/day-nav";
import { closedDaysOf } from "@/lib/schedule/grid";
import { cn } from "@/lib/utils";

import { usePublicBoard } from "./public-schedule-context";

/** Which day the board shows, sized to its own content rather than the row. */
export function PublicToolbar({ className }: { className?: string }) {
  const { schedule, pendingDate, goToDay } = usePublicBoard();
  return (
    <DayNav
      date={schedule.grid.date}
      pendingDate={pendingDate}
      onNavigate={goToDay}
      timezone={schedule.grid.timezone}
      horizonDays={schedule.horizonDays}
      now={schedule.now}
      closedDays={closedDaysOf(schedule.hours)}
      className={cn("w-fit", className)}
    />
  );
}
