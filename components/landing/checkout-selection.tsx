"use client";

import { CalendarCheckIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/venue";

import {
  formatHours,
  hoursChip,
  hoursText,
  runHours,
  runLabel,
  sortRuns,
  type PickRun,
} from "./booking";

/** A court as the card names it. */
type CourtName = { id: number; name: string };

/**
 * The Selected courts and slots card (spec 0015, AC-1): one row per run with
 * its court, day, time range and an hours chip, then the fee line and the
 * total. The fee line stays beside the total although they match today,
 * because feature 19's discount line goes between them.
 */
export function SelectedCourts({
  runs,
  courts,
  heading,
  amount,
}: {
  runs: readonly PickRun[];
  courts: readonly CourtName[];
  /** The day, from `formatDayHeading`. */
  heading: string;
  amount: number;
}) {
  const hours = runHours(runs);
  const sorted = sortRuns(
    runs,
    courts.map((court) => court.id),
  );
  return (
    <section
      aria-label="Selected courts and slots"
      className="ring-border bg-card flex flex-col rounded-2xl ring-1"
    >
      <p className="text-caption text-muted-foreground px-4 pt-3 font-medium tracking-wider uppercase">
        Selected courts and slots
      </p>
      <ul className="divide-border flex flex-col divide-y px-4">
        {sorted.map((run) => (
          <li key={`${run.courtId}|${run.startsAt}`} className="flex items-center gap-3 py-3">
            <span
              aria-hidden="true"
              className="bg-state-booked text-state-booked-fg grid size-9 shrink-0 place-items-center rounded-xl"
            >
              <CalendarCheckIcon weight="bold" className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-label">
                {courts.find((court) => court.id === run.courtId)?.name ?? `Court ${run.courtId}`}
              </span>
              <span className="text-caption text-muted-foreground tabular-nums">
                {heading} · {runLabel(run)}
              </span>
            </div>
            <span className="bg-muted text-caption shrink-0 rounded-full px-2.5 py-1 font-medium tabular-nums">
              {hoursChip(runHours([run]))}
            </span>
          </li>
        ))}
      </ul>
      <dl className="border-border text-body flex flex-col gap-2 border-t px-4 py-3 tabular-nums">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Court hours ({formatHours(hours)})</dt>
          <dd>{formatPeso(amount)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-label">Total</dt>
          <dd className="text-title">{formatPeso(amount)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** "Fri 30 Oct · 3 hours · ₱750": the order in one line, on Terms and Payment (AC-1). */
export function SummaryLine({
  runs,
  heading,
  amount,
}: {
  runs: readonly PickRun[];
  heading: string;
  amount: number;
}) {
  return (
    <p className="bg-muted text-label rounded-full px-4 py-2 text-center tabular-nums">
      {heading} · {hoursText(runHours(runs))} · {formatPeso(amount)}
    </p>
  );
}

/** A small caps label over a group of facts, with an optional Edit (AC-11, AC-14). */
export function InfoCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <h3 className="text-caption text-muted-foreground font-medium tracking-wider uppercase">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A list of facts in a bordered card. */
export function Facts({ children }: { children: React.ReactNode }) {
  return (
    <dl className="ring-border text-body flex flex-col gap-2 rounded-2xl p-4 ring-1">{children}</dl>
  );
}

export function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{term}</dt>
      <dd className="min-w-0 text-right break-words tabular-nums">{children}</dd>
    </div>
  );
}
