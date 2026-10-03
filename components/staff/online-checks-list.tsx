"use client";

import {
  ArrowUUpLeftIcon,
  CaretRightIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  SpinnerIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";

import { BoardSheet } from "@/components/board-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBookingCode } from "@/lib/booking/code";
import { findOnlineBooking } from "@/lib/online-checks/actions";
import {
  CHECKS_LIST_CAP,
  CODE_INVALID_MESSAGE,
  CODE_NOT_FOUND_MESSAGE,
  normalizeBookingCode,
  timeTag,
} from "@/lib/online-checks/constants";
import { formatAmount, formatRun, moreRuns } from "@/lib/online-checks/format";
import type { OnlineCheckItem } from "@/lib/online-checks/types";
import { cn } from "@/lib/utils";

import { bookingStateLabel } from "./online-booking-block";
import { useStaffBoard } from "./staff-schedule-context";

/**
 * The Online bookings list. Spec 0016, AC-2, AC-3 and AC-16.
 *
 * Find by code at the top, then To check (soonest first slot first, so a
 * started one sits on top) and Refunds owed (oldest first). Pressing an item
 * opens its booking in its own sheet, whatever day the board is on. Time tags
 * count on from the server's clock, a minute at a time.
 */
export function OnlineChecksList({
  open,
  onOpenChange,
  timeZone,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}) {
  const { checks, openBooking } = useStaffBoard();
  const { load } = checks;

  const choose = (bookingId: number) => {
    onOpenChange(false);
    openBooking(bookingId);
  };

  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      focusOnOpen={false}
      title="Online bookings"
      description="Payments waiting for their check, and refunds the venue owes."
    >
      <div className="flex flex-col gap-6">
        <FindByCode onFound={choose} />

        {load.state === "loading" ? (
          <div className="flex flex-col gap-2" aria-label="Loading the online bookings">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : null}

        {load.state === "failed" ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-label text-destructive flex items-start gap-2">
              <WarningIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>The online bookings did not load. {load.message}</span>
            </p>
            <Button type="button" variant="outline" className="h-11" onClick={checks.retry}>
              Try again
            </Button>
          </div>
        ) : null}

        {load.state === "loaded" ? (
          <Sections
            serverNow={Date.parse(load.checks.serverNow)}
            receivedAt={load.receivedAt}
            toCheck={load.checks.toCheck}
            refunds={load.checks.refundsOwed}
            more={load.checks.more}
            timeZone={timeZone}
            onChoose={choose}
          />
        ) : null}
      </div>
    </BoardSheet>
  );
}

/** The server's now, carried forward by the time since it arrived, a minute at a time (AC-16). */
function useServerNow(serverNow: number, receivedAt: number): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return serverNow + Math.max(0, tick - receivedAt);
}

function Sections({
  serverNow,
  receivedAt,
  toCheck,
  refunds,
  more,
  timeZone,
  onChoose,
}: {
  serverNow: number;
  receivedAt: number;
  toCheck: readonly OnlineCheckItem[];
  refunds: readonly OnlineCheckItem[];
  more: { toCheck: boolean; refunds: boolean };
  timeZone: string;
  onChoose: (bookingId: number) => void;
}) {
  const now = useServerNow(serverNow, receivedAt);
  return (
    <>
      <Section
        title="To check"
        items={toCheck}
        more={more.toCheck}
        render={(item) => {
          const tag = timeTag(item.firstActiveStartsAt, item.submittedAt, now);
          const late = tag === "Started, not checked";
          return (
            <span
              className={cn(
                "text-caption inline-flex items-center gap-1",
                late ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {late ? (
                <WarningIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <ClockIcon aria-hidden="true" className="size-3.5" />
              )}
              {tag}
            </span>
          );
        }}
        timeZone={timeZone}
        onChoose={onChoose}
      />
      <Section
        title="Refunds owed"
        items={refunds}
        more={more.refunds}
        render={(item) => (
          <span className="text-caption text-muted-foreground inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-foreground inline-flex items-center gap-1">
              <ArrowUUpLeftIcon aria-hidden="true" className="size-3.5" />
              Refund {formatAmount(item.amount)}
            </span>
            {bookingStateLabel(item)}
          </span>
        )}
        timeZone={timeZone}
        onChoose={onChoose}
      />
    </>
  );
}

function Section({
  title,
  items,
  more,
  render,
  timeZone,
  onChoose,
}: {
  title: string;
  items: readonly OnlineCheckItem[];
  more: boolean;
  render: (item: OnlineCheckItem) => React.ReactNode;
  timeZone: string;
  onChoose: (bookingId: number) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-label text-muted-foreground">
        {title}
        {items.length > 0 ? (
          <span className="tabular-nums">
            {" "}
            · {items.length}
            {more ? "+" : ""}
          </span>
        ) : null}
      </h3>
      {items.length === 0 ? (
        <p className="text-body text-muted-foreground border-border rounded-2xl border border-dashed px-4 py-3">
          Nothing waiting.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const first = item.runs[0];
            const extra = moreRuns(item.runs);
            return (
              <li key={item.bookingId}>
                <button
                  type="button"
                  onClick={() => onChoose(item.bookingId)}
                  className="border-border bg-card hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors duration-(--dur-fast) outline-none focus-visible:ring-[3px] motion-reduce:transition-none"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-label truncate">{item.customerName}</span>
                      <span className="text-label tabular-nums">{formatAmount(item.amount)}</span>
                    </span>
                    <span className="text-caption text-muted-foreground tabular-nums">
                      <span className="font-mono">{formatBookingCode(item.code)}</span>
                      {item.referenceLast4 ? ` · Ending ${item.referenceLast4}` : ""}
                    </span>
                    {first ? (
                      <span className="text-caption tabular-nums">
                        {formatRun(first, timeZone)}
                        {extra ? <span className="text-muted-foreground"> {extra}</span> : null}
                      </span>
                    ) : null}
                    {render(item)}
                  </span>
                  <CaretRightIcon
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {more ? (
        <p className="text-caption text-muted-foreground">Showing the first {CHECKS_LIST_CAP}</p>
      ) : null}
    </section>
  );
}

/** Find by booking code (AC-3): exact, 8 characters, any state. */
function FindByCode({ onFound }: { onFound: (bookingId: number) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ids = { input: useId(), error: useId() };

  const search = async (value: string) => {
    if (normalizeBookingCode(value) === null) {
      setError(CODE_INVALID_MESSAGE);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await findOnlineBooking({ code: value });
      if (result.ok) {
        setCode("");
        onFound(result.data.bookingId);
        return;
      }
      setError(result.error.kind === "not_found" ? CODE_NOT_FOUND_MESSAGE : result.error.message);
    } catch {
      setError("The search did not go through. Check the connection.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      role="search"
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void search(code);
      }}
    >
      <Label htmlFor={ids.input}>Find by booking code</Label>
      <div className="flex gap-2">
        <Input
          id={ids.input}
          value={code}
          onChange={(event) => {
            const value = event.target.value;
            setCode(value);
            if (error) setError(null);
            // The search runs by itself the moment 8 valid characters are in (AC-3).
            if (!pending && normalizeBookingCode(value) !== null) void search(value);
          }}
          placeholder="K7MQ-3XPT"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.error : undefined}
          className="h-11 font-mono uppercase"
        />
        <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={pending}>
          {pending ? (
            <SpinnerIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <MagnifyingGlassIcon aria-hidden="true" />
          )}
          Find
        </Button>
      </div>
      {error ? (
        <p
          id={ids.error}
          role="alert"
          className="text-caption text-destructive flex items-start gap-1"
        >
          <WarningIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </form>
  );
}
