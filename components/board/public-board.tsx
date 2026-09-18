"use client";

import { useEffect, useRef } from "react";

import { CELL_VIEWS, type CellView } from "@/components/schedule/cell-view";
import { ScheduleGrid, type GridView } from "@/components/schedule/schedule-grid";
import { useChangedCells } from "@/components/schedule/use-changed-cells";
import { calendarDateInZone } from "@/lib/time";
import { cn } from "@/lib/utils";

import { usePublicBoard } from "./public-schedule-context";

/**
 * The public board. Spec 0006, AC-1, AC-3, AC-4, AC-5 and AC-12.
 *
 * Read only: the grid takes no `onSelectCell`, so the cells take focus and
 * nothing acts. The interesting parts are about time and about staying
 * honest: the dimming follows the board's clock, the highlight follows what
 * changed under the reader, and every re read replaces the day whole.
 */

/** How long a changed cell stays highlighted. Same as the staff board. */
const CHANGED_HOLD_MS = 4_000;

/** The views a public reader can meet: the browser only ones never appear here. */
const PUBLIC_LEGEND: readonly CellView[] = CELL_VIEWS.filter(
  (view) =>
    view !== "selected" && view !== "saving" && view !== "failed" && view !== "out-of-hours",
);

export function PublicBoard() {
  const { schedule, refetchError, now, requestRead, dayNavPending } = usePublicBoard();
  const { grid } = schedule;
  const changedCells = useChangedCells(grid, CHANGED_HOLD_MS);

  // Outside opening hours only earns a legend entry on a day that actually
  // has one: most venues never show it, and an unused entry is just noise.
  const hasOutOfHours = grid.rows.some((row) => row.outOfHours);
  const legendViews = hasOutOfHours ? [...PUBLIC_LEGEND, "out-of-hours" as const] : PUBLIC_LEGEND;

  const isToday = calendarDateInZone(new Date(now), grid.timezone) === grid.date;

  // Scroll to now, once, on today's board. Never again after a re read: the
  // reader may have scrolled away on purpose (AC-4). Instant, never animated.
  const markerRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!isToday || scrolled.current === grid.date) return;
    scrolled.current = grid.date;
    markerRef.current?.scrollIntoView({ block: "start" });
  }, [isToday, grid.date]);

  const view: GridView =
    grid.courts.length === 0
      ? { kind: "empty", reason: "no-courts" }
      : grid.rows.length === 0
        ? { kind: "empty", reason: "closed" }
        : { kind: "ready", grid };

  return (
    <div className="flex flex-col gap-4">
      {refetchError ? (
        <p role="alert" className="text-caption text-destructive">
          The last reload failed: {refetchError}. The board shows the day as it was before.
        </p>
      ) : null}

      <ScheduleGrid
        view={view}
        legendViews={legendViews}
        changedCells={changedCells}
        now={isToday ? new Date(now).toISOString() : undefined}
        markerRef={markerRef}
        onRetry={requestRead}
        className={cn(
          dayNavPending &&
            "pointer-events-none opacity-50 transition-opacity motion-reduce:transition-none",
        )}
        busy={dayNavPending}
      />
    </div>
  );
}
