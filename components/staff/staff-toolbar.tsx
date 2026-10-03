"use client";

import { DayNav } from "@/components/day-nav";
import { closedDaysOf } from "@/lib/schedule/grid";

import { OnlineChecksChip } from "./online-checks-chip";
import { useStaffBoard } from "./staff-schedule-context";

/** The strip under the brand band: which day, and the online bookings to check (spec 0016, AC-1). */
export function StaffToolbar() {
  const { schedule, pendingDate, goToDay } = useStaffBoard();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DayNav
        date={schedule.grid.date}
        pendingDate={pendingDate}
        onNavigate={goToDay}
        timezone={schedule.grid.timezone}
        horizonDays={schedule.horizonDays}
        now={schedule.now}
        closedDays={closedDaysOf(schedule.hours)}
        allowPastPick
        className="w-fit"
      />
      <OnlineChecksChip />
    </div>
  );
}
