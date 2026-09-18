"use client";

import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { addDays, daysBetween, todayInZone } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Which day the board is showing, and how to get to another one. Spec 0003.
 *
 * The day travels as a `?date=YYYY-MM-DD` search parameter and nothing else, so a
 * day is a shareable link and the server can render the right grid on the first
 * request. This component only ever pushes that parameter; it holds no state of
 * its own and derives nothing the server has not already decided.
 *
 * The bounds come from `venue_settings`: yesterday and before is history, and
 * `booking_horizon_days` is as far ahead as anybody may look.
 *
 * `now` is the server's stamp on the schedule (spec 0006, AC-4), so which day
 * counts as today never comes from the device clock. Absent, the device clock
 * is used, which only the design gallery does.
 */
export function DayNav({
  date,
  timezone,
  horizonDays,
  now,
  allowPastPick = false,
  className,
  onNavigatingChange,
}: {
  date: string;
  timezone: string;
  horizonDays: number;
  now?: string;
  /** Staff may pick any past day in the calendar; the public board may not. */
  allowPastPick?: boolean;
  className?: string;
  /** Told every time a prev/next tap starts or settles, so a board can dim itself meanwhile. */
  onNavigatingChange?: (pending: boolean) => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Which day a tap is on its way to, so only the button that was pressed
  // swaps its icon for a spinner rather than both at once.
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  useEffect(() => {
    onNavigatingChange?.(isPending);
  }, [isPending, onNavigatingChange]);

  // Cleared as soon as the transition settles, rather than in its own effect:
  // an effect that calls setState the moment it runs just cascades a render.
  const activePendingTo = isPending ? pendingTo : null;

  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  // The label jumps to the day being navigated to the moment it is tapped,
  // ahead of the server: it is pure date arithmetic on a date already on
  // screen (in the calendar) or a step away from it (the arrows), never a
  // guess at what the day holds. The grid itself waits for the real read
  // (`dayNavPending` dims it) because only the server knows what is on it.
  const displayDate = activePendingTo ?? date;

  // Only the control that started the current trip spins; the other two are
  // merely disabled, so a next-day tap does not also spin the calendar icon.
  const calendarIsSource =
    activePendingTo !== null && activePendingTo !== prevDate && activePendingTo !== nextDate;

  const today = todayInZone(timezone, now ? new Date(now) : new Date());
  const offset = daysBetween(today, displayDate);
  const atHorizon = offset >= horizonDays;

  const href = (to: string) => {
    const next = new URLSearchParams(params);
    next.set("date", to);
    return `${pathname}?${next.toString()}`;
  };

  const goTo = (to: string) => {
    setPendingTo(to);
    startTransition(() => {
      router.push(href(to));
    });
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
        aria-disabled={isPending}
        aria-busy={activePendingTo === prevDate}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        onClick={() => !isPending && goTo(prevDate)}
      >
        {activePendingTo === prevDate ? (
          <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <ChevronLeft aria-hidden="true" />
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
          <ChevronRight aria-hidden="true" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          aria-disabled={isPending}
          aria-busy={activePendingTo === nextDate}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          onClick={() => !isPending && goTo(nextDate)}
        >
          {activePendingTo === nextDate ? (
            <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </Button>
      )}

      <DatePicker
        date={date}
        timezone={timezone}
        horizonDays={horizonDays}
        now={now}
        allowPastPick={allowPastPick}
        navigate={goTo}
        pending={calendarIsSource}
        disabled={isPending}
      />
    </div>
  );
}
