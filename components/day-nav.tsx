"use client";

import { CaretLeftIcon, CaretRightIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { addDays, daysBetween, todayInZone } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Which day the board is showing, and how to get to another one. Spec 0003,
 * made controlled by spec 0014.
 *
 * The board owns the day: it hands in the day on screen, the day a change is
 * on its way to (`pendingDate`), and `onNavigate`, which reads the new day in
 * the browser. This component only works out which day a control asks for and
 * remembers which control asked, so only that one spins.
 *
 * The bounds come from `venue_settings`: yesterday and before is history, and
 * `booking_horizon_days` is as far ahead as anybody may look.
 *
 * `now` is the server's stamp on the schedule (spec 0006, AC-4), so which day
 * counts as today never comes from the device clock. Absent, the device clock
 * is used, which only the design gallery does.
 */
type DayControl = "prev" | "next" | "calendar";

export function DayNav({
  date,
  pendingDate,
  onNavigate,
  timezone,
  horizonDays,
  now,
  allowPastPick = false,
  closedDays,
  className,
}: {
  /** The day on screen. */
  date: string;
  /** The day a change is on its way to, while it is being read. */
  pendingDate?: string;
  /** Asked for another day. The board reads it and, once it lands, updates `date`. */
  onNavigate: (date: string) => void;
  timezone: string;
  horizonDays: number;
  now?: string;
  /** Staff may pick any past day in the calendar; the public board may not. */
  allowPastPick?: boolean;
  /** Days of the week the venue is closed, passed through to the calendar. */
  closedDays?: readonly number[];
  className?: string;
}) {
  // Which control started the current trip, so only it swaps its icon for a
  // spinner rather than every control at once. Stale once the day lands, which
  // is harmless: it is only read while `pendingDate` matches it.
  const [source, setSource] = useState<{ to: string; control: DayControl } | null>(null);

  const isPending = pendingDate !== undefined;
  const spinning: DayControl | null = !isPending
    ? null
    : source?.to === pendingDate
      ? source.control
      : // A change nobody here started (Try again, the board going back to today).
        pendingDate === addDays(date, -1)
        ? "prev"
        : pendingDate === addDays(date, 1)
          ? "next"
          : "calendar";

  // The label jumps to the day being navigated to the moment it is tapped,
  // ahead of the read: it is pure date arithmetic on a date already on
  // screen (in the calendar) or a step away from it (the arrows), never a
  // guess at what the day holds. The grid itself waits for the real read
  // (`dayNavPending` dims it) because only the server knows what is on it.
  const displayDate = pendingDate ?? date;

  // A second tap on the same arrow steps on from the day in the heading, and
  // supersedes the first (spec 0014, AC-3).
  const prevDate = addDays(displayDate, -1);
  const nextDate = addDays(displayDate, 1);

  const today = todayInZone(timezone, now ? new Date(now) : new Date());
  const offset = daysBetween(today, displayDate);
  const atHorizon = offset >= horizonDays;

  // While a change is on its way, only the control that started it still
  // answers; the others are disabled (spec 0014, AC-2).
  const blocked = (control: DayControl) => isPending && spinning !== control;

  const goTo = (to: string, control: DayControl) => {
    if (blocked(control)) return;
    setSource({ to, control });
    onNavigate(to);
  };

  const monthDay = new Intl.DateTimeFormat("en-PH", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  }).format(new Date(`${displayDate}T12:00:00Z`));

  const heading =
    offset === 0
      ? `Today, ${monthDay}`
      : new Intl.DateTimeFormat("en-PH", {
          timeZone: timezone,
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(new Date(`${displayDate}T12:00:00Z`));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous day"
        aria-disabled={blocked("prev")}
        aria-busy={spinning === "prev"}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        onClick={() => goTo(prevDate, "prev")}
      >
        {spinning === "prev" ? (
          <SpinnerIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <CaretLeftIcon aria-hidden="true" />
        )}
      </Button>

      <p className="text-body min-w-0 flex-1 text-center font-semibold">
        <span className="tabular-nums">{heading}</span>
        {offset < 0 ? (
          <span className="text-label text-muted-foreground font-normal"> · past</span>
        ) : null}
      </p>

      {atHorizon ? (
        <Button
          variant="outline"
          size="icon"
          disabled
          aria-label={`Next day. The venue takes bookings ${horizonDays} days ahead, and this is the last one.`}
        >
          <CaretRightIcon aria-hidden="true" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          aria-disabled={blocked("next")}
          aria-busy={spinning === "next"}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          onClick={() => goTo(nextDate, "next")}
        >
          {spinning === "next" ? (
            <SpinnerIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <CaretRightIcon aria-hidden="true" />
          )}
        </Button>
      )}

      <DatePicker
        date={date}
        timezone={timezone}
        horizonDays={horizonDays}
        now={now}
        allowPastPick={allowPastPick}
        closedDays={closedDays}
        navigate={(to) => goTo(to, "calendar")}
        pending={spinning === "calendar"}
        disabled={blocked("calendar")}
      />
    </div>
  );
}
