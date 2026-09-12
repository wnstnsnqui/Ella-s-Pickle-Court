"use client";

import { CalendarDays, LandPlot } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Grid } from "@/lib/schedule/grid";
import { formatSlotLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

import { cellKey } from "./cell-key";
import { cellViewFor } from "./cell-view";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { GridSkeleton } from "./grid-skeleton";
import { ScheduleCell } from "./schedule-cell";
import { StateLegend } from "./state-legend";
import type { CellView } from "./cell-view";

/**
 * Everything the grid can be. Spec 0003.
 *
 * One input, a union, so the component cannot be handed a state it has no data
 * for: there is no way to be loading and hold rows, or to be in error and still
 * be asked for a court name.
 */
export type GridView =
  | { kind: "ready"; grid: Grid }
  | { kind: "loading" }
  | { kind: "empty"; reason: "no-courts" | "closed" }
  | { kind: "error"; message: string };

export type ScheduleGridProps = {
  view: GridView;
  /** Which views the legend shows. Staff see the ones only they can cause. */
  legendViews?: readonly CellView[];
  /** Absent means a read only board: the cells still take focus, nothing acts. */
  onSelectCell?: (courtId: number, rowStartsAt: string) => void;
  selectedCell?: string | null;
  pendingCells?: ReadonlySet<string>;
  failedCells?: ReadonlySet<string>;
  changedCells?: ReadonlySet<string>;
  onRetry?: () => void;
  className?: string;
};

/** How far Page Up and Page Down travel: roughly a phone screen of rows. */
const PAGE_ROWS = 7;

export function ScheduleGrid({
  view,
  legendViews,
  onSelectCell,
  selectedCell = null,
  pendingCells,
  failedCells,
  changedCells,
  onRetry,
  className,
}: ScheduleGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  // The roving tabindex: the whole grid is one tab stop, and this is the cell
  // that stop lands on. Arrow keys move it; nothing else does.
  const [rawCursor, setCursor] = useState({ row: 0, col: 0 });
  const [cursorIsLive, setCursorIsLive] = useState(false);

  const rows = view.kind === "ready" ? view.grid.rows : [];
  const courts = view.kind === "ready" ? view.grid.courts : [];

  // Keep the cursor inside the grid when a shorter day arrives under it. Clamped
  // on the way out rather than corrected in an effect, so there is never a render
  // where the cursor points at a row that is not there.
  const lastRow = Math.max(rows.length - 1, 0);
  const lastCol = Math.max(courts.length - 1, 0);
  const cursor = useMemo(
    () => ({ row: Math.min(rawCursor.row, lastRow), col: Math.min(rawCursor.col, lastCol) }),
    [rawCursor, lastRow, lastCol],
  );

  useEffect(() => {
    if (!cursorIsLive) return;
    const target = gridRef.current?.querySelector<HTMLElement>(
      `[data-row="${cursor.row}"][data-col="${cursor.col}"]`,
    );
    target?.focus();
  }, [cursor, cursorIsLive]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0 || courts.length === 0) return;
      const clamp = (row: number, col: number) => ({
        row: Math.min(Math.max(row, 0), lastRow),
        col: Math.min(Math.max(col, 0), lastCol),
      });

      let next: { row: number; col: number } | null = null;
      switch (event.key) {
        case "ArrowRight":
          next = clamp(cursor.row, cursor.col + 1);
          break;
        case "ArrowLeft":
          next = clamp(cursor.row, cursor.col - 1);
          break;
        case "ArrowDown":
          next = clamp(cursor.row + 1, cursor.col);
          break;
        case "ArrowUp":
          next = clamp(cursor.row - 1, cursor.col);
          break;
        case "Home":
          next = event.ctrlKey ? clamp(0, 0) : clamp(cursor.row, 0);
          break;
        case "End":
          next = event.ctrlKey ? clamp(lastRow, lastCol) : clamp(cursor.row, lastCol);
          break;
        case "PageDown":
          next = clamp(cursor.row + PAGE_ROWS, cursor.col);
          break;
        case "PageUp":
          next = clamp(cursor.row - PAGE_ROWS, cursor.col);
          break;
        default:
          return;
      }
      event.preventDefault();
      setCursorIsLive(true);
      setCursor(next);
    },
    [cursor, lastRow, lastCol, rows.length, courts.length],
  );

  if (view.kind === "loading") {
    return (
      <div className={className}>
        <StateLegend views={legendViews} className="mb-3" />
        <p role="status" className="sr-only">
          Loading the schedule
        </p>
        <GridSkeleton />
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className={className}>
        <ErrorState message={view.message} onRetry={onRetry} />
      </div>
    );
  }

  if (view.kind === "empty") {
    return (
      <div className={className}>
        {view.reason === "no-courts" ? (
          <EmptyState
            icon={LandPlot}
            title="No courts yet"
            body="Once a court is added to the venue it will show up here with its hours."
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Closed all day"
            body="The venue is not open on this day. Try another one with the arrows above."
          />
        )}
      </div>
    );
  }

  const { grid } = view;
  const columns = `var(--col-time) repeat(${grid.courts.length}, minmax(var(--col-court-min), 1fr))`;

  return (
    <div className={className}>
      <StateLegend views={legendViews} className="mb-3" />

      {/*
       * The sideways scroller (AC-7). Only this box scrolls, so the page itself
       * never slides under the reader on a phone, and the time column stays
       * pinned inside it.
       */}
      <div className="border-border overflow-x-auto rounded-lg border">
        <div
          ref={gridRef}
          role="grid"
          aria-label={`Court schedule for ${grid.date}`}
          aria-rowcount={grid.rows.length + 1}
          aria-colcount={grid.courts.length + 1}
          onKeyDown={onKeyDown}
          className="grid min-w-max gap-px p-1"
          style={{ gridTemplateColumns: columns }}
        >
          <div role="row" className="contents">
            <div
              role="columnheader"
              className="bg-background text-caption text-muted-foreground w-time-col sticky left-0 z-20 grid place-items-center py-2"
            >
              Time
            </div>
            {grid.courts.map((court) => (
              <div
                key={court.id}
                role="columnheader"
                className="text-label grid place-items-center px-2 py-2 text-center"
              >
                {court.name}
              </div>
            ))}
          </div>

          {grid.rows.map((row, rowIndex) => (
            <div role="row" key={`${row.startsAt}-${row.endsAt}`} className="contents">
              <div
                role="rowheader"
                className={cn(
                  "bg-background text-caption text-muted-foreground h-row w-time-col sticky left-0 z-10 grid place-items-center tabular-nums",
                  row.outOfHours && "text-state-outofhours-fg",
                )}
              >
                <time dateTime={row.startsAt}>{formatSlotLabel(row.label)}</time>
              </div>
              {row.cells.map((cell, colIndex) => {
                const key = cellKey(cell.courtId, row.startsAt);
                const court = grid.courts[colIndex];
                const cellView = cellViewFor({
                  state: cell.state,
                  outOfHours: row.outOfHours,
                  selected: selectedCell === key,
                  saving: pendingCells?.has(key),
                  failed: failedCells?.has(key),
                });
                return (
                  <ScheduleCell
                    key={key}
                    view={cellView}
                    label={`${court?.name ?? "Court"} at ${formatSlotLabel(row.label)}`}
                    focused={cursor.row === rowIndex && cursor.col === colIndex}
                    changed={changedCells?.has(key)}
                    onSelect={
                      onSelectCell ? () => onSelectCell(cell.courtId, row.startsAt) : undefined
                    }
                    onFocus={() => {
                      setCursorIsLive(true);
                      setCursor({ row: rowIndex, col: colIndex });
                    }}
                    data-row={rowIndex}
                    data-col={colIndex}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
