"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { addDays, daysBetween, dayOfWeek, formatDayHeading } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Which day a board shows, as a strip of days. Spec 0018, AC-8, modelled on
 * the landing's own strip (which keeps its frozen copy).
 *
 * Every day is a native radio, so arrow keys, focus and screen readers behave
 * as they already know how. It runs from venue today through the booking
 * horizon. Below 1024px it is one row the thumb scrolls sideways; from 1024px
 * it shows a week at a time, paged by the round arrows, with one highlight that
 * slides to the chosen day (and jumps under reduced motion).
 *
 * The chosen day is `pendingDate` while a read is on its way, else the day on
 * screen, so the highlight moves the moment a day is tapped and snaps back on
 * its own if that read fails (spec 0014, AC-2). A day outside the strip (a past
 * day, from the calendar) highlights nothing.
 *
 * `calendar` sits at the end of the row: the date picker, which reaches every
 * day the board allows, the past included on staff.
 */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** How many days the wide strip shows at once, and how far an arrow pages it. */
const STRIP_DAYS = 7;

export function DayStrip({
  date,
  pendingDate,
  today,
  horizonDays,
  closedDays,
  onPick,
  calendar,
  className,
}: {
  /** The day on screen. */
  date: string;
  /** The day a change is on its way to. */
  pendingDate?: string;
  /** Venue today, from the server's clock. */
  today: string;
  horizonDays: number;
  /** Days of the week the venue is closed, `0` for Sunday. */
  closedDays: readonly number[];
  onPick: (date: string) => void;
  /** The calendar button, at the end of the strip's row. */
  calendar?: React.ReactNode;
  className?: string;
}) {
  const chosen = pendingDate ?? date;
  const total = horizonDays + 1;
  const count = Math.min(STRIP_DAYS, total);
  const lastStart = Math.max(total - count, 0);
  const allDays = Array.from({ length: total }, (_, i) => addDays(today, i));
  const chosenIndex = daysBetween(today, chosen);

  // The week on show. It opens on the week holding the chosen day, and follows
  // the chosen day whenever a pick lands outside it (the calendar, Try again).
  const pageOf = (index: number) =>
    Math.min(Math.floor(index / STRIP_DAYS) * STRIP_DAYS, lastStart);
  const [start, setStart] = useState(() =>
    chosenIndex >= 0 && chosenIndex < total ? pageOf(chosenIndex) : 0,
  );
  const [followed, setFollowed] = useState(chosen);
  if (followed !== chosen) {
    setFollowed(chosen);
    if (
      chosenIndex >= 0 &&
      chosenIndex < total &&
      (chosenIndex < start || chosenIndex >= start + count)
    ) {
      setStart(pageOf(chosenIndex));
    }
  }
  const days = allDays.slice(start, start + count);
  const index = days.indexOf(chosen);

  // The board body remounts for every landed day (`DayBoundary`), so the phone
  // row starts scrolled to its first day. Bring the chosen day into view, at
  // once and without moving the page.
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = row.current;
    const option = scroller?.querySelector<HTMLElement>("[data-checked]");
    if (!scroller || !option) return;
    // The row is the option's offset parent, so this ignores the row's own scroll.
    const left = option.offsetLeft;
    const visible =
      left >= scroller.scrollLeft &&
      left + option.offsetWidth <= scroller.scrollLeft + scroller.clientWidth;
    if (!visible) scroller.scrollLeft = left - 4;
  }, [chosen]);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <fieldset className="min-w-0 flex-1">
        <legend className="sr-only">Pick a day</legend>

        {/* Below lg: every day in one row the thumb scrolls through. */}
        <div
          ref={row}
          className="bg-muted relative flex snap-x scroll-px-1 [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain rounded-2xl p-1 lg:hidden [&::-webkit-scrollbar]:hidden"
        >
          {allDays.map((day) => (
            <DayOption
              key={day}
              date={day}
              today={today}
              closedDays={closedDays}
              name="board-day-scroll"
              checked={day === chosen}
              onPick={onPick}
              className={cn(
                "w-14 shrink-0 snap-start transition-colors duration-150",
                day === chosen && "bg-card shadow-sm",
              )}
            />
          ))}
        </div>

        {/* lg and up: a week at a time, paged by the arrows. */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous week"
            disabled={start === 0}
            onClick={() => setStart(Math.max(0, start - STRIP_DAYS))}
            className="press size-10 shrink-0 rounded-full"
          >
            <CaretLeftIcon aria-hidden="true" weight="bold" />
          </Button>
          <div
            className="bg-muted relative grid min-w-0 flex-1 rounded-2xl p-1"
            style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
          >
            <span
              aria-hidden="true"
              className={cn(
                "bg-card ease-in-out-strong absolute inset-y-1 left-1 rounded-xl shadow-sm transition-[translate,opacity] duration-250 motion-reduce:transition-none",
                index === -1 && "opacity-0",
              )}
              style={{
                width: `calc((100% - 0.5rem) / ${count})`,
                translate: `${Math.max(index, 0) * 100}% 0`,
              }}
            />
            {days.map((day, i) => (
              <DayOption
                key={day}
                date={day}
                today={today}
                closedDays={closedDays}
                name="board-day"
                checked={index === i}
                onPick={onPick}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next week"
            disabled={start >= lastStart}
            onClick={() => setStart(Math.min(lastStart, start + STRIP_DAYS))}
            className="press size-10 shrink-0 rounded-full"
          >
            <CaretRightIcon aria-hidden="true" weight="bold" />
          </Button>
        </div>
      </fieldset>
      {calendar}
    </div>
  );
}

/**
 * The accessible name of a day in the strip: "Today, Tue 29 Sep", or
 * "Wed 30 Sep", with ". Closed" on a weekday the venue does not open.
 */
export function dayOptionName(date: string, today: string, closedDays: readonly number[]): string {
  const heading = formatDayHeading(date);
  const closed = closedDays.includes(dayOfWeek(date));
  return `${date === today ? `Today, ${heading}` : heading}${closed ? ". Closed" : ""}`;
}

/** One day. Both strips render these; CSS shows one, so each keeps its own group name. */
function DayOption({
  date,
  today,
  closedDays,
  name,
  checked,
  onPick,
  className,
}: {
  date: string;
  today: string;
  closedDays: readonly number[];
  name: string;
  checked: boolean;
  onPick: (date: string) => void;
  className?: string;
}) {
  const closed = closedDays.includes(dayOfWeek(date));
  return (
    <label
      data-checked={checked || undefined}
      className={cn(
        "has-[:focus-visible]:outline-ring relative z-10 flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 sm:min-h-14 sm:py-2",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        onChange={() => onPick(date)}
        aria-label={dayOptionName(date, today, closedDays)}
      />
      <span
        className={cn(
          "text-caption transition-colors duration-150",
          checked ? "text-foreground" : "text-muted-foreground",
          closed && "line-through",
        )}
      >
        {date === today ? "Today" : WEEKDAY_SHORT[dayOfWeek(date)]}
      </span>
      <span className={cn("text-title tabular-nums", closed && "text-muted-foreground")}>
        {Number(date.slice(8))}
      </span>
    </label>
  );
}
