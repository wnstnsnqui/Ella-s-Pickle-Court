"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
 */
export function DayNav({
  date,
  timezone,
  horizonDays,
  className,
}: {
  date: string;
  timezone: string;
  horizonDays: number;
  className?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const today = todayInZone(timezone);
  const offset = daysBetween(today, date);
  const atHorizon = offset >= horizonDays;

  const href = (to: string) => {
    const next = new URLSearchParams(params);
    next.set("date", to);
    return `${pathname}?${next.toString()}`;
  };

  const heading = new Intl.DateTimeFormat("en-PH", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button asChild variant="outline" size="icon" aria-label="Previous day">
        <Link href={href(addDays(date, -1))}>
          <ChevronLeft aria-hidden="true" />
        </Link>
      </Button>

      <p className="text-label min-w-0 flex-1 text-center">
        <span className="tabular-nums">{heading}</span>
        {offset === 0 ? <span className="text-muted-foreground"> · today</span> : null}
        {offset < 0 ? <span className="text-muted-foreground"> · past</span> : null}
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
        <Button asChild variant="outline" size="icon" aria-label="Next day">
          <Link href={href(addDays(date, 1))}>
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      )}

      {offset !== 0 ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={href(today)}>Today</Link>
        </Button>
      ) : null}
    </div>
  );
}
