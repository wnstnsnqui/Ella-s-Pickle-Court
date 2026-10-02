"use client";

import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ProhibitIcon,
  RecordIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { captureBookingIntent, captureBrowserException } from "@/lib/analytics/browser";
import { openRows } from "@/lib/schedule/availability";
import { closedDaysOf, type GridCourt, type GridRow } from "@/lib/schedule/grid";
import type { Schedule } from "@/lib/schedule/queries";
import { addDays, dayOfWeek, daysBetween, formatDayHeading, formatSlotLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/venue";

import {
  bookingTotal,
  groupPicks,
  isPressable,
  pickKey,
  smsBody,
  takenMessage,
  tileView,
  type TileView,
} from "./booking";
import {
  CheckoutSheet,
  type CheckoutOrder,
  type CheckoutOutcome,
  type PickerRefusal,
} from "./checkout-sheet";
import { MessageCard } from "./message-card";
import { showComingSoonToast, showReadFailedToast } from "./notices";
import { PRESS } from "./press";
import { readDay } from "./read-day";

const TILE: Record<TileView, { name: string; icon: typeof ClockIcon; className: string }> = {
  free: {
    name: "Free",
    icon: CheckCircleIcon,
    className:
      "bg-state-available text-state-available-fg border-state-available-border/30 hover:border-state-available-border",
  },
  selected: {
    name: "Selected",
    icon: RecordIcon,
    className: "bg-state-selected text-state-selected-fg border-state-selected-border shadow-sm",
  },
  booked: {
    name: "Booked",
    icon: CalendarCheckIcon,
    className: "bg-state-booked text-state-booked-fg border-transparent",
  },
  closed: {
    name: "Closed",
    icon: ProhibitIcon,
    className: "bg-state-unavailable text-state-unavailable-fg border-transparent",
  },
  past: {
    name: "Past",
    icon: ClockIcon,
    className:
      "text-state-unavailable-fg border-state-unavailable-border/50 border-dashed bg-transparent",
  },
};

const LEGEND: readonly TileView[] = ["free", "selected", "booked", "closed", "past"];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** How often the Past tiles catch up with the clock, as the board does. */
const TICK_MS = 60_000;

/** How many days the strip shows at once, and how far an arrow pages it. */
const STRIP_DAYS = 7;

/** What the strip needs, fixed by the first read of today. */
type Week = {
  today: string;
  horizonDays: number;
  timezone: string;
  closedDays: number[];
  now: string;
};

function weekOf(schedule: Schedule): Week {
  return {
    today: schedule.grid.date,
    horizonDays: schedule.horizonDays,
    timezone: schedule.grid.timezone,
    closedDays: closedDaysOf(schedule.hours),
    now: schedule.now,
  };
}

type Status = "ready" | "loading" | "card";

/**
 * The court booking section. Spec 0013, AC-3 to AC-14.
 *
 * Today arrives from the server render; any other day is read in the browser
 * from `GET /api/schedule`, so the page's URL stays `/`. Only the newest read
 * may land. A read that fails is retried quietly, and when the retries run out
 * (or the rate limit answers) the hours and the summary give way to the
 * message card, with one toast. Nothing here ever shows an error.
 *
 * The clock is the server's: `schedule.now` plus whole minutes this tab has
 * held it, so a device with a wrong clock cannot move the Past tiles.
 *
 * With checkout on (spec 0015, AC-1), the button reads Book and opens the
 * checkout sheet on the picks as they stand; off, it is spec 0013's Request
 * booking and its coming soon toast, unchanged.
 */
export function BookingPicker({
  initial,
  limited,
  checkout,
}: {
  /** Today's read, or null when it failed or was skipped. */
  initial: Schedule | null;
  /** The shared rate limit is spent: straight to the message card (AC-11). */
  limited: boolean;
  /** Online checkout is on (spec 0015, AC-26). */
  checkout: boolean;
}) {
  const [shown, setShown] = useState<Schedule | null>(initial);
  const [week, setWeek] = useState<Week | null>(initial ? weekOf(initial) : null);
  /** The day the player asked for; undefined means today before today is known. */
  const [chosen, setChosen] = useState<string | undefined>(initial?.grid.date);
  const [status, setStatus] = useState<Status>(limited ? "card" : initial ? "ready" : "loading");
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set());
  const latest = useRef(0);

  // The checkout sheet: the order is frozen when Book is pressed, and each
  // press mounts a fresh sheet (a new key), so a new `submission_id`.
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  /** Where focus lands however the card closes (spec 0015, AC-27). */
  const summaryHeading = useRef<HTMLHeadingElement>(null);

  /** Read a day and land it, if it is still the newest read. Callers set `loading`. */
  const read = useCallback(async (date: string | undefined) => {
    const id = ++latest.current;
    const result = await readDay(date, { cancelled: () => latest.current !== id });
    if (latest.current !== id || (!result.ok && result.reason === "cancelled")) return;

    if (result.ok) {
      setShown(result.data);
      setWeek((held) => held ?? weekOf(result.data));
      setChosen((held) => held ?? result.data.grid.date);
      setStatus("ready");
      return;
    }

    setStatus("card");
    showReadFailedToast();
    if (result.reason === "limited") {
      console.warn("landing: the schedule read was rate limited, showing the message card");
    } else {
      console.error(`landing: the schedule read for ${date ?? "today"} failed after every retry`);
      captureBrowserException(new Error("landing: schedule read failed after retries"));
    }
  }, []);

  // First load: the server read failed (read today again, quietly), or the
  // limit was spent (the card is already showing; say so once). The toast
  // waits a tick so the Toaster, mounted after the page, is listening. The
  // ref keeps it to once even when development runs every effect twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Status already starts at `loading` when there is no initial read.
    if (limited) setTimeout(showReadFailedToast, 0);
    else if (!initial) void read(undefined);
  }, [initial, limited, read]);

  function load(date: string | undefined) {
    setStatus("loading");
    void read(date);
  }

  // The clock, reset whenever a read brings a fresh server stamp.
  const [clock, setClock] = useState({ stamp: shown?.now, minutes: 0 });
  if (clock.stamp !== shown?.now) setClock({ stamp: shown?.now, minutes: 0 });
  useEffect(() => {
    const timer = setInterval(
      () => setClock((held) => ({ ...held, minutes: held.minutes + 1 })),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, []);
  const nowMs = clock.stamp ? Date.parse(clock.stamp) + clock.minutes * TICK_MS : 0;

  function pickDay(date: string) {
    if (date === chosen && status === "ready") return;
    setChosen(date);
    setPicks(new Set());
    load(date);
  }

  function toggle(key: string) {
    setPicks((held) => {
      const next = new Set(held);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const loading = status === "loading";
  const grid = shown?.grid ?? null;
  const rows = grid ? openRows(grid) : [];

  // Only picks still pressable count: an hour that has just ended drops out.
  const livePicks = new Set(
    grid
      ? rows.flatMap((row) =>
          row.cells
            .filter((cell) => picks.has(pickKey(cell.courtId, row.startsAt)))
            .filter((cell) => tileView(cell, row, nowMs, true) === "selected")
            .map((cell) => pickKey(cell.courtId, row.startsAt)),
        )
      : [],
  );
  const groups = grid ? groupPicks(grid, livePicks) : [];
  const heading = grid ? formatDayHeading(grid.date) : null;

  function request() {
    if (!shown || !grid || !week || !heading || livePicks.size === 0) return;
    if (checkout) {
      setOrder({
        date: grid.date,
        heading,
        groups,
        total: bookingTotal(livePicks.size, grid.slotMinutes, shown.hourlyRate),
        slotMinutes: grid.slotMinutes,
        picks: [...livePicks].map((key) => {
          const [courtId, startsAt] = key.split("|");
          return { courtId: Number(courtId), startsAt };
        }),
      });
      setSheetKey((key) => key + 1);
      setSheetOpen(true);
    } else {
      showComingSoonToast(smsBody(heading, groups));
    }
    captureBookingIntent({
      slots: livePicks.size,
      courts: groups.length,
      days_ahead: daysBetween(week.today, grid.date),
    });
  }

  /**
   * The sheet has closed. A booking clears the picks and reads the day, so the
   * new booking shows (AC-14); a refund reads the day so the taken hours show
   * Booked while the rest stay picked (AC-13). Leaving keeps the picks as they
   * were: any hold on them has been released, so they are free again (AC-15).
   */
  function closeSheet(outcome: CheckoutOutcome) {
    setSheetOpen(false);
    if (outcome === "left") return;
    if (outcome === "booked") setPicks(new Set());
    load(chosen);
  }

  /**
   * A pick went while the sheet was open, or the hours changed (AC-6, AC-7):
   * the sheet closes, the day is read again so the taken tiles read Booked
   * while the rest stay picked, and one toast says what happened.
   */
  function refused(refusal: PickerRefusal) {
    setSheetOpen(false);
    toast(
      refusal.kind === "slot_taken" && grid
        ? takenMessage(grid, refusal.slots)
        : "The hours changed. Pick your hours again.",
      { id: "landing-checkout-refused" },
    );
    load(chosen);
  }

  const card = status === "card";

  return (
    <div className={cn("grid gap-4", !card && "lg:grid-cols-[1fr_20rem]")}>
      <div className="bg-card ring-border flex min-w-0 flex-col gap-6 rounded-3xl p-4 shadow-sm ring-1 sm:p-6">
        {week ? (
          <DayStrip week={week} chosen={chosen} onPick={pickDay} />
        ) : loading ? (
          <StripSkeleton />
        ) : null}

        {card ? (
          <MessageCard onTryAgain={() => load(chosen)} className="p-0 shadow-none ring-0 sm:p-0" />
        ) : grid ? (
          <div
            aria-busy={loading}
            className={cn(
              "transition-opacity duration-150",
              loading && "pointer-events-none opacity-50",
            )}
          >
            <div className="mb-3">
              <Legend />
            </div>
            {grid.closed || rows.length === 0 ? (
              <p className="text-body text-muted-foreground bg-muted rounded-2xl px-4 py-6 text-center">
                Closed on {heading}
              </p>
            ) : (
              <HoursTable
                heading={heading ?? ""}
                courts={grid.courts}
                rows={rows}
                nowMs={nowMs}
                picks={livePicks}
                onToggle={toggle}
              />
            )}
          </div>
        ) : (
          <HoursSkeleton />
        )}
      </div>

      {card ? null : (
        <aside
          aria-label="Your booking"
          className="bg-card ring-border flex flex-col gap-5 self-start rounded-3xl p-6 shadow-sm ring-1 lg:sticky lg:top-24"
        >
          <h3 ref={summaryHeading} tabIndex={-1} className="text-title rounded-sm">
            Your booking
          </h3>
          <dl className="text-body flex flex-col gap-3">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Day</dt>
              <dd>{heading ?? "Today"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Hours</dt>
              <dd className="text-right tabular-nums">
                {groups.length === 0
                  ? "None yet"
                  : groups.map((group) => (
                      <span key={group.court.id} className="block">
                        {group.court.name}: {group.labels.join(", ")}
                      </span>
                    ))}
              </dd>
            </div>
          </dl>
          <div className="border-border flex items-baseline justify-between border-t pt-4">
            <span className="text-label">Total</span>
            <span className="text-display tabular-nums" aria-live="polite">
              {formatPeso(
                shown ? bookingTotal(livePicks.size, shown.grid.slotMinutes, shown.hourlyRate) : 0,
              )}
            </span>
          </div>
          <Button
            type="button"
            size="lg"
            disabled={livePicks.size === 0 || loading}
            onClick={request}
            className={cn("bg-mark text-mark-foreground hover:bg-mark/90 h-12 w-full", PRESS)}
          >
            {checkout ? "Book" : "Request booking"}
            <ArrowRightIcon aria-hidden="true" weight="bold" data-icon="inline-end" />
          </Button>
          {shown ? (
            <p className="text-caption text-muted-foreground">
              {formatPeso(shown.hourlyRate)} per court hour.
            </p>
          ) : null}
        </aside>
      )}

      {order ? (
        <CheckoutSheet
          key={sheetKey}
          open={sheetOpen}
          onClose={closeSheet}
          order={order}
          returnFocusTo={summaryHeading}
          onRefused={refused}
          describeTaken={(slots) =>
            grid ? takenMessage(grid, slots) : "Some of your hours were just booked."
          }
        />
      ) : null}
    </div>
  );
}

/**
 * A week of days as native radios, so arrow keys, focus and screen readers
 * behave as they already know how (AC-6, AC-25). The caret buttons page the
 * window a week at a time up to the booking horizon, without changing the
 * chosen day. The one moving piece slides to the chosen day, and fades out
 * while the window is paged away from it; with reduced motion it jumps.
 */
function DayStrip({
  week,
  chosen,
  onPick,
}: {
  week: Week;
  chosen: string | undefined;
  onPick: (date: string) => void;
}) {
  const total = week.horizonDays + 1;
  const count = Math.min(STRIP_DAYS, total);
  const lastStart = total - count;
  const [start, setStart] = useState(0);
  const days = Array.from({ length: count }, (_, i) => addDays(week.today, start + i));
  const index = chosen ? days.indexOf(chosen) : -1;
  const allDays = Array.from({ length: total }, (_, i) => addDays(week.today, i));

  return (
    <fieldset className="min-w-0">
      <legend className="text-title mb-3 tabular-nums">
        {chosen ? (
          <>
            {chosen === week.today ? <span className="text-muted-foreground">Today, </span> : null}
            {formatDayHeading(chosen)}
          </>
        ) : (
          "Day"
        )}
      </legend>
      {/* Below lg: every bookable day in one row the thumb scrolls through. */}
      <div className="bg-muted flex snap-x scroll-px-1 [scrollbar-width:none] gap-1 overflow-x-auto overscroll-x-contain rounded-2xl p-1 lg:hidden [&::-webkit-scrollbar]:hidden">
        {allDays.map((date) => (
          <DayOption
            key={date}
            date={date}
            week={week}
            name="landing-day-scroll"
            checked={date === chosen}
            onPick={onPick}
            className={cn(
              "w-16 shrink-0 snap-start transition-colors duration-150",
              date === chosen && "bg-card shadow-sm",
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
          className="shrink-0 rounded-full"
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
          {days.map((date, i) => (
            <DayOption
              key={date}
              date={date}
              week={week}
              name="landing-day"
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
          className="shrink-0 rounded-full"
        >
          <CaretRightIcon aria-hidden="true" weight="bold" />
        </Button>
      </div>
    </fieldset>
  );
}

/**
 * One day in the strip. Both strips render these; only one is displayed at a
 * time, so each keeps its own radio group name.
 */
function DayOption({
  date,
  week,
  name,
  checked,
  onPick,
  className,
}: {
  date: string;
  week: Week;
  name: string;
  checked: boolean;
  onPick: (date: string) => void;
  className?: string;
}) {
  const closed = week.closedDays.includes(dayOfWeek(date));
  const heading = formatDayHeading(date);
  const isToday = date === week.today;
  return (
    <label
      className={cn(
        "has-[:focus-visible]:outline-ring relative z-10 flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        onChange={() => onPick(date)}
        aria-label={`${isToday ? `Today, ${heading}` : heading}${closed ? ". Closed" : ""}`}
      />
      <span
        className={cn(
          "text-caption transition-colors duration-150",
          checked ? "text-foreground" : "text-muted-foreground",
          closed && "line-through",
        )}
      >
        {isToday ? "Today" : WEEKDAY_SHORT[dayOfWeek(date)]}
      </span>
      <span className={cn("text-title tabular-nums", closed && "text-muted-foreground")}>
        {Number(date.slice(8))}
      </span>
    </label>
  );
}

/**
 * One row per open hour, one column per court in sort order (AC-3), so a
 * third court added in Settings is a third column with no code change.
 */
function HoursTable({
  heading,
  courts,
  rows,
  nowMs,
  picks,
  onToggle,
}: {
  heading: string;
  courts: GridCourt[];
  rows: GridRow[];
  nowMs: number;
  picks: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const roomy = courts.length <= 2;
  return (
    <table className="w-full table-fixed border-separate border-spacing-1.5">
      <caption className="sr-only">Court hours on {heading}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-14 sm:w-16">
            <span className="sr-only">Time</span>
          </th>
          {courts.map((court) => (
            <th
              key={court.id}
              scope="col"
              className="text-label truncate pb-1 text-center font-medium"
            >
              {court.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const label = formatSlotLabel(row.label);
          return (
            <tr key={row.startsAt}>
              <th
                scope="row"
                className="text-caption text-muted-foreground pr-1 text-left font-normal tabular-nums"
              >
                {label}
              </th>
              {courts.map((court) => {
                const cell = row.cells.find((entry) => entry.courtId === court.id);
                if (!cell) return <td key={court.id} />;
                const key = pickKey(court.id, row.startsAt);
                const view = tileView(cell, row, nowMs, picks.has(key));
                const { name, icon: Icon, className } = TILE[view];
                const pressable = isPressable(view);
                return (
                  <td key={court.id}>
                    <button
                      type="button"
                      disabled={!pressable}
                      aria-pressed={pressable ? view === "selected" : undefined}
                      aria-label={`${court.name} at ${label}. ${name}.`}
                      onClick={() => onToggle(key)}
                      className={cn(
                        "rounded-cell text-cell flex min-h-11 w-full items-center justify-center gap-1.5 border px-2",
                        "ease-out-strong transition-[scale,background-color,border-color,color] duration-150",
                        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                        pressable ? "active:scale-[0.96]" : "cursor-not-allowed",
                        className,
                      )}
                    >
                      <Icon aria-hidden="true" weight="bold" className="size-4 shrink-0" />
                      <span
                        aria-hidden="true"
                        className={cn("truncate", !roomy && "hidden sm:inline")}
                      >
                        {name}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Key"
      className="text-caption text-muted-foreground flex flex-wrap gap-x-4 gap-y-2"
    >
      {LEGEND.map((view) => {
        const { icon: Icon, name } = TILE[view];
        return (
          <li key={view} className="flex items-center gap-1.5">
            <Icon aria-hidden="true" weight="bold" className="size-3.5" />
            {name}
          </li>
        );
      })}
    </ul>
  );
}

function StripSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <Skeleton className="h-4 w-10" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}

/** The first load's placeholder while today is read again in the browser (AC-8). */
function HoursSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading court hours" className="flex flex-col gap-1.5">
      <Skeleton className="mb-2 h-4 w-16" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr] gap-1.5">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
