"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { BoardSheet } from "@/components/board-sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery, WIDE_QUERY } from "@/components/use-media-query";
import { addDays, calendarDateToLocalDate, localDateToCalendarDate, todayInZone } from "@/lib/time";

/**
 * The calendar that jumps a board straight to a day, instead of tapping the
 * prev/next arrows one day at a time. Spec 0011.
 *
 * A popover anchored to the trigger from 768 pixels wide, sized to its own
 * content; the same bottom sheet every other board control uses below that,
 * where an anchored popup has nowhere good to point on a touch screen.
 *
 * It only ever produces the same `?date=` link the arrows already build,
 * through the `href` builder `DayNav` passes in; the server still validates
 * every date exactly as it does today. The disabled bound and the two reasons
 * below are the client side mirror of `resolveDate` (`lib/schedule/queries.ts`),
 * so a day disabled here and a day `resolveDate` refuses never disagree.
 */

const PAST_REASON = "That day has passed. The board shows today onward.";
const horizonReason = (lastDay: string) => `The schedule only goes as far as ${lastDay} for now.`;

/**
 * The bound the calendar disables against, in both the plain `YYYY-MM-DD` shape
 * and the local `Date` shape `react-day-picker` compares days by. Pulled out of
 * the component so the bound math (the client side mirror of `resolveDate`) is
 * checkable without a DOM.
 */
export function pickerBounds(today: string, horizonDays: number) {
  const lastDay = addDays(today, horizonDays);
  return {
    lastDay,
    todayLocal: calendarDateToLocalDate(today),
    lastDayLocal: calendarDateToLocalDate(lastDay),
  };
}

/** Whether a day is disabled, mirroring `resolveDate`'s two refusal cases. */
export function isDayDisabled(
  day: Date,
  todayLocal: Date,
  lastDayLocal: Date,
  allowPastPick: boolean,
): boolean {
  return (!allowPastPick && day < todayLocal) || day > lastDayLocal;
}

/** The reason read out for a disabled day, verbatim from `resolveDate`. */
export function disabledReason(
  day: Date,
  todayLocal: Date,
  lastDayLocal: Date,
  allowPastPick: boolean,
  lastDay: string,
): string | undefined {
  if (!allowPastPick && day < todayLocal) return PAST_REASON;
  if (day > lastDayLocal) return horizonReason(lastDay);
  return undefined;
}

export function DatePicker({
  date,
  timezone,
  horizonDays,
  now,
  allowPastPick = false,
  href,
}: {
  date: string;
  timezone: string;
  horizonDays: number;
  now?: string;
  allowPastPick?: boolean;
  href: (to: string) => string;
}) {
  const router = useRouter();
  const wide = useMediaQuery(WIDE_QUERY);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const today = todayInZone(timezone, now ? new Date(now) : new Date());
  const { lastDay, todayLocal, lastDayLocal } = pickerBounds(today, horizonDays);
  const selectedLocal = calendarDateToLocalDate(date);

  const calendarProps = {
    mode: "single" as const,
    required: true as const,
    selected: selectedLocal,
    today: todayLocal,
    // Uncontrolled: `defaultMonth` seeds the view but lets the calendar's own
    // prev/next nav move it from there. A controlled `month` with no
    // `onMonthChange` (the prior code) froze the nav entirely. The popover and
    // sheet both unmount their content on close, so a fresh mount re-seeds
    // from the current selection the next time either opens.
    defaultMonth: selectedLocal,
    startMonth: allowPastPick ? undefined : todayLocal,
    endMonth: lastDayLocal,
    disabled: (day: Date) => isDayDisabled(day, todayLocal, lastDayLocal, allowPastPick),
    labels: {
      labelDayButton: (day: Date) => {
        const label = day.toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const reason = disabledReason(day, todayLocal, lastDayLocal, allowPastPick, lastDay);
        return reason ? `${label}. ${reason}` : label;
      },
    },
    onSelect: (day: Date) => {
      setOpen(false);
      router.push(href(localDateToCalendarDate(day)));
    },
  };

  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button ref={triggerRef} variant="outline" size="icon" aria-label="Pick a date">
            <CalendarDays aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-fit p-2">
          <Calendar {...calendarProps} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="icon"
        aria-label="Pick a date"
        onClick={() => setOpen(true)}
      >
        <CalendarDays aria-hidden="true" />
      </Button>
      <BoardSheet
        open={open}
        onOpenChange={setOpen}
        title="Pick a date"
        description="Choose a day to jump straight to."
        returnFocusTo={triggerRef}
        compact
      >
        {/* Full width instead of the calendar's own compact, shrink-wrapped
            default, which otherwise sits off center in a sheet this wide. */}
        <Calendar {...calendarProps} classNames={{ root: "w-full" }} />
      </BoardSheet>
    </>
  );
}
