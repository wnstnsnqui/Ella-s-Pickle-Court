"use client";

import { DayNav } from "@/components/day-nav";

import { useStaffBoard } from "./staff-schedule-context";

/** The strip under the brand band: which day. */
export function StaffToolbar() {
  const { schedule, date } = useStaffBoard();
  return (
    <div className="flex items-center justify-between gap-3">
      <DayNav
        date={date}
        timezone={schedule.grid.timezone}
        horizonDays={schedule.horizonDays}
        now={schedule.now}
        allowPastPick
        className="w-fit"
      />
    </div>
  );
}
