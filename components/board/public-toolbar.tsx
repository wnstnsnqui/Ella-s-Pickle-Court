"use client";

import { DayNav } from "@/components/day-nav";
import { LiveIndicator } from "@/components/live-indicator";

import { usePublicBoard } from "./public-schedule-context";

/** The strip under the brand band: which day, and whether the board is live. */
export function PublicToolbar() {
  const { schedule, channelStatus, lastUpdatedAt } = usePublicBoard();
  return (
    <div className="flex items-center justify-between gap-3">
      <DayNav
        date={schedule.grid.date}
        timezone={schedule.grid.timezone}
        horizonDays={schedule.horizonDays}
        now={schedule.now}
        className="min-w-0 flex-1"
      />
      <LiveIndicator channelStatus={channelStatus} lastUpdatedAt={lastUpdatedAt} />
    </div>
  );
}
