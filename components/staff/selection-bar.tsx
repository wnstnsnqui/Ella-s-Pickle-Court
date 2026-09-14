"use client";

import { Ban, CalendarPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describeSummary, summarizeRuns, type SelectionRun } from "@/lib/schedule/selection";
import { formatSlotLabel } from "@/lib/time";

/**
 * What is picked, and what to do with it. Spec 0005, AC-3.
 *
 * Sticky above the bottom edge so it sits under the thumb on a phone and stays
 * put while the grid scrolls. It lists the selection as runs rather than cells,
 * because a run is what becomes a booking: two hours with a gap between them
 * read as two lines here, so the desk is never surprised by two bookings.
 */
export function SelectionBar({
  runs,
  onBook,
  onClose,
  onClear,
}: {
  runs: readonly SelectionRun[];
  onBook: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClose: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClear: () => void;
}) {
  const summary = describeSummary(summarizeRuns(runs));
  const bookings = runs.length;

  return (
    <div
      role="region"
      aria-label="Your selection"
      className="bg-card border-border sticky bottom-3 z-20 mt-4 flex flex-col gap-3 rounded-lg border p-3 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">
            {summary}
            <span className="text-muted-foreground">
              {" "}
              · {bookings} {bookings === 1 ? "booking" : "bookings"}
            </span>
          </p>
          <ul className="text-caption text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {runs.map((run) => (
              <li key={run.keys[0]} className="tabular-nums">
                {run.courtName} · {formatSlotLabel(run.startTime)} to {formatSlotLabel(run.endTime)}
              </li>
            ))}
          </ul>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden="true" />
          Clear
        </Button>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={onBook} className="flex-1">
          <CalendarPlus aria-hidden="true" />
          Book
        </Button>
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
          <Ban aria-hidden="true" />
          Close court
        </Button>
      </div>
    </div>
  );
}
