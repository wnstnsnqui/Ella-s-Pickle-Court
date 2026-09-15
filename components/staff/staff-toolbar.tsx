"use client";

import { DayNav } from "@/components/day-nav";
import { LiveIndicator } from "@/components/live-indicator";

import { useStaffBoard } from "./staff-schedule-context";

/** The strip under the brand band: which day, and whether the board is live. */
export function StaffToolbar() {
  const { schedule, date, channelStatus, lastUpdatedAt } = useStaffBoard();
  return (
    <div className="flex items-center justify-between gap-3">
      <DayNav
        date={date}
        timezone={schedule.grid.timezone}
        horizonDays={schedule.horizonDays}
        now={schedule.now}
        className="min-w-0 flex-1"
      />
      <LiveIndicator channelStatus={channelStatus} lastUpdatedAt={lastUpdatedAt} />
    </div>
  );
}
