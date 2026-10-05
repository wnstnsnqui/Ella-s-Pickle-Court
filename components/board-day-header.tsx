"use client";

import { useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { DayStrip } from "@/components/day-strip";
import { daysBetween, formatDayHeading, todayInZone } from "@/lib/time";

/**
 * The top of a board card (spec 0018, AC-5 and AC-8): the day heading with
 * whatever sits on its right, then the day strip with the calendar at its end.
 *
 * The board owns the day; this only works out what to show while a change is
 * on its way (spec 0014, AC-2). The heading and the strip's highlight name the
 * target day at once, the grid below dims until it lands, and a failed read
 * snaps both back because they follow `pendingDate`. Only the calendar keeps a
 * spinner, and only when it is the control that started the trip.
 *
 * Venue today is the server's stamp (`now`) in the venue's zone, never the
 * device clock.
 */
export function BoardDayHeader({
  date,
  pendingDate,
  onNavigate,
  timezone,
  horizonDays,
  now,
  closedDays,
  allowPastPick = false,
  aside,
}: {
  /** The day on screen. */
  date: string;
  /** The day a change is on its way to. */
  pendingDate?: string;
  onNavigate: (date: string) => void;
  timezone: string;
  horizonDays: number;
  /** The server's clock stamp on the schedule. */
  now: string;
  closedDays: readonly number[];
  /** Staff may pick any past day in the calendar; the public board may not. */
  allowPastPick?: boolean;
  /** Beside the heading: the online checks chip on staff. */
  aside?: React.ReactNode;
}) {
  // Which day the calendar asked for, so it spins only for its own trip.
  const [calendarTrip, setCalendarTrip] = useState<string | null>(null);
  const pending = pendingDate !== undefined;
  const calendarPending = pending && calendarTrip === pendingDate;

  const shown = pendingDate ?? date;
  const today = todayInZone(timezone, new Date(now));
  const offset = daysBetween(today, shown);

  return (
    <>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-title tabular-nums">
          {offset === 0 ? <span className="text-muted-foreground">Today, </span> : null}
          {formatDayHeading(shown)}
          {offset < 0 ? (
            <span className="text-label text-muted-foreground font-normal"> · past</span>
          ) : null}
        </h2>
        {aside}
      </div>
      <DayStrip
        date={date}
        pendingDate={pendingDate}
        today={today}
        horizonDays={horizonDays}
        closedDays={closedDays}
        onPick={(to) => {
          setCalendarTrip(null);
          onNavigate(to);
        }}
        calendar={
          <DatePicker
            date={shown}
            timezone={timezone}
            horizonDays={horizonDays}
            now={now}
            allowPastPick={allowPastPick}
            closedDays={closedDays}
            navigate={(to) => {
              setCalendarTrip(to);
              onNavigate(to);
            }}
            pending={calendarPending}
            disabled={pending && !calendarPending}
          />
        }
      />
    </>
  );
}
