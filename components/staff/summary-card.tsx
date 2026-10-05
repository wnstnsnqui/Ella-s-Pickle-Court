"use client";

import { ArrowRightIcon, ProhibitIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { describeSummary, summarizeRuns, type SelectionRun } from "@/lib/schedule/selection";
import { formatSlotLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * What is picked, and what to do with it. Spec 0005, AC-3, as the landing's
 * summary card (spec 0018, AC-10).
 *
 * The board renders it twice, once per `layout`, and CSS shows one. From
 * 1024px it is a card beside the grid that never moves: it stays with a
 * muted line when nothing is picked, so the grid never changes width. Below
 * that it floats 12px above the bottom edge while something is picked, rising
 * in and leaving faster than it came (`[data-summary-float]` in
 * `app/globals.css`). It lists the picks as runs grouped by court, because a
 * run is what becomes a booking: two hours with a gap between them make two
 * bookings, and the card says so.
 */

/** "Court 1: 5pm to 7pm, 9pm to 10pm", one line per court in the order picked. */
export function runsByCourt(runs: readonly SelectionRun[]): string[] {
  const courts = new Map<number, { name: string; spans: string[] }>();
  for (const run of runs) {
    const span = `${formatSlotLabel(run.startTime)} to ${formatSlotLabel(run.endTime)}`;
    const held = courts.get(run.courtId);
    if (held) held.spans.push(span);
    else courts.set(run.courtId, { name: run.courtName, spans: [span] });
  }
  return [...courts.values()].map((court) => `${court.name}: ${court.spans.join(", ")}`);
}

export function SummaryCard({
  layout,
  runs,
  day,
  onBook,
  onClose,
  onClear,
}: {
  /** The card beside the grid from 1024px, or the card floating over it below. */
  layout: "aside" | "floating";
  runs: readonly SelectionRun[];
  /** The landed day, as the board's heading names it. */
  day: string;
  onBook: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClose: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClear: () => void;
}) {
  const picked = runs.length > 0;

  // The floating card stays mounted while it leaves, showing what it held.
  const [floating, setFloating] = useState(picked);
  const [held, setHeld] = useState(runs);
  if (picked && !floating) setFloating(true);
  if (picked && held !== runs) setHeld(runs);

  if (layout === "aside") {
    return (
      <aside
        aria-label="Your selection"
        className="surface-card sticky top-24 hidden flex-col gap-5 self-start p-6 lg:flex"
      >
        <h2 className="text-title">Your selection</h2>
        {picked ? (
          <>
            <Details runs={runs} day={day} />
            <div className="flex flex-col gap-2">
              <Button type="button" variant="ink" onClick={onBook} className="press h-12 w-full">
                Book
                <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="press h-12 w-full"
              >
                <ProhibitIcon aria-hidden="true" weight="bold" />
                Close hours
              </Button>
              <Button type="button" variant="ghost" onClick={onClear} className="press h-11 w-full">
                <XIcon aria-hidden="true" weight="bold" />
                Clear
              </Button>
            </div>
          </>
        ) : (
          <p className="text-body text-muted-foreground">Pick free hours to book or close them</p>
        )}
      </aside>
    );
  }

  return floating ? (
    <div
      role="region"
      aria-label="Your selection"
      data-summary-float=""
      data-state={picked ? "open" : "closed"}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !picked) setFloating(false);
      }}
      className={cn(
        "surface-glass elevation-float sticky bottom-3 z-20 flex flex-col gap-3 rounded-3xl p-3 lg:hidden",
        !picked && "pointer-events-none",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Details runs={held} day={day} compact />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear selection"
          onClick={onClear}
          disabled={!picked}
          className="press size-11 shrink-0 rounded-full"
        >
          <XIcon aria-hidden="true" weight="bold" className="size-5" />
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ink"
          onClick={onBook}
          disabled={!picked}
          className="press h-12 flex-1"
        >
          Book
          <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={!picked}
          className="press h-12 flex-1"
        >
          <ProhibitIcon aria-hidden="true" weight="bold" />
          Close hours
        </Button>
      </div>
    </div>
  ) : null;
}

function Details({
  runs,
  day,
  compact = false,
}: {
  runs: readonly SelectionRun[];
  day: string;
  compact?: boolean;
}) {
  const summary = describeSummary(summarizeRuns(runs));
  const bookings = runs.length;
  const count = `${bookings} ${bookings === 1 ? "booking" : "bookings"}`;

  if (compact) {
    return (
      <div className="min-w-0 pl-1">
        <p className="text-label tabular-nums">
          {day}
          <span className="text-muted-foreground">
            {" "}
            · {count}, {summary}
          </span>
        </p>
        <ul className="text-caption text-muted-foreground mt-0.5 tabular-nums">
          {runsByCourt(runs).map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <dl className="text-body flex flex-col gap-3">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Day</dt>
        <dd className="tabular-nums">{day}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Hours</dt>
        <dd className="text-right tabular-nums">
          {runsByCourt(runs).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </dd>
      </div>
      <div className="border-border flex items-baseline justify-between gap-4 border-t pt-4">
        <dt className="text-label">Makes</dt>
        <dd className="text-label tabular-nums">
          {count}, {summary}
        </dd>
      </div>
    </dl>
  );
}
