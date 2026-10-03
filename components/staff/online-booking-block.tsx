"use client";

import {
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  GlobeIcon,
  HourglassIcon,
  PhoneIcon,
  ProhibitIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBookingCode } from "@/lib/booking/code";
import { reasonLabel } from "@/lib/online-checks/constants";
import {
  formatAmount,
  formatEventStamp,
  formatRun,
  formatVenueDay,
} from "@/lib/online-checks/format";
import type { BookingEventView, StaffBooking } from "@/lib/online-checks/types";

import { ProofThumbnail } from "./online-checks-proof";
import { BOOKING_STATUS_LABEL, formatStamp, telHref } from "./format";
import type { BookingLoad } from "./use-online-booking";

/**
 * The Online booking block: the full check view. Spec 0015, AC-21, grown by
 * spec 0016, AC-6.
 *
 * The same from a cell, the list or a code search: where the booking stands,
 * any refund, the code, the amount due beside the reference digits and the
 * screenshot, the player, when it was sent, every run, and the History of who
 * decided what. Every active staff member sees all of it; the buttons that
 * act on it are the sheet's footer. A cleared field reads "Cleared".
 */
export function OnlineBookingBlock({
  load,
  timeZone,
  onRetry,
  withCustomer = true,
}: {
  load: BookingLoad;
  timeZone: string;
  onRetry: () => void;
  /** False in a row's sheet, which already shows the name and phone above. */
  withCustomer?: boolean;
}) {
  return (
    <section aria-labelledby="online-booking-heading" aria-busy={load.state === "loading"}>
      <h3
        id="online-booking-heading"
        className="text-label text-foreground mb-3 flex items-center gap-2"
      >
        <GlobeIcon aria-hidden="true" className="size-4" />
        Online booking
      </h3>

      {load.state === "loading" ? (
        <div className="flex flex-col gap-3" aria-label="Loading the online booking">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-28 w-24 rounded-xl" />
          </div>
        </div>
      ) : null}

      {load.state === "failed" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-label text-destructive flex items-start gap-2">
            <WarningIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{load.message}</span>
          </p>
          <Button type="button" variant="outline" className="h-11" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {load.state === "loaded" ? (
        <BookingDetails booking={load.booking} timeZone={timeZone} withCustomer={withCustomer} />
      ) : null}
    </section>
  );
}

/** The state in words, with the one case the status alone cannot say (AC-13). */
export function bookingStateLabel(booking: Pick<StaffBooking, "status" | "submittedAt">): string {
  if (booking.status === "expired" && booking.submittedAt) {
    return "Expired, paid after the hold";
  }
  return BOOKING_STATUS_LABEL[booking.status];
}

const STATE_ICON = {
  held: HourglassIcon,
  pending_check: ClockIcon,
  confirmed: CheckCircleIcon,
  rejected: XCircleIcon,
  expired: HourglassIcon,
  cancelled: ProhibitIcon,
} as const;

/** "Refund owed ₱1,000", "Refunded ₱1,000 on Sat 31 Oct by Ana", "No refund needed". */
export function refundLine(booking: StaffBooking, timeZone: string): string | null {
  switch (booking.refundStatus) {
    case "owed":
      return `Refund owed ${formatAmount(booking.amount)}`;
    case "refunded":
      return `Refunded ${formatAmount(booking.refundAmount ?? booking.amount)}${
        booking.refundedAt ? ` on ${formatVenueDay(booking.refundedAt, timeZone)}` : ""
      }${booking.refundedByName ? ` by ${booking.refundedByName}` : ""}`;
    case "not_owed":
      return "No refund needed";
    default:
      return null;
  }
}

function BookingDetails({
  booking,
  timeZone,
  withCustomer,
}: {
  booking: StaffBooking;
  timeZone: string;
  withCustomer: boolean;
}) {
  const StateIcon = STATE_ICON[booking.status];
  const refund = refundLine(booking, timeZone);
  const cleared = <span className="text-muted-foreground">Cleared</span>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={booking.status === "pending_check" ? "default" : "secondary"}>
          <StateIcon aria-hidden="true" />
          {bookingStateLabel(booking)}
        </Badge>
        {refund ? (
          <Badge variant={booking.refundStatus === "owed" ? "destructive" : "outline"}>
            <ArrowUUpLeftIcon aria-hidden="true" />
            {refund}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-4">
        <dl className="text-body grid min-w-0 flex-1 grid-cols-[minmax(0,6rem)_1fr] gap-x-3 gap-y-2">
          <dt className="text-label text-muted-foreground">Code</dt>
          <dd className="font-mono tabular-nums">{formatBookingCode(booking.code)}</dd>

          <dt className="text-label text-muted-foreground">Amount due</dt>
          <dd className="tabular-nums">{formatAmount(booking.amount)}</dd>

          <dt className="text-label text-muted-foreground">Reference</dt>
          <dd>
            {booking.referenceLast4 ? (
              <span className="tabular-nums">Ending {booking.referenceLast4}</span>
            ) : booking.submittedAt ? (
              cleared
            ) : (
              <span className="text-muted-foreground">Not sent yet</span>
            )}
          </dd>

          {booking.submittedAt ? (
            <>
              <dt className="text-label text-muted-foreground">Sent</dt>
              <dd className="tabular-nums">{formatStamp(booking.submittedAt, timeZone)}</dd>
            </>
          ) : null}
        </dl>
        <ProofThumbnail
          key={booking.id}
          bookingId={booking.id}
          code={booking.code}
          hasProof={booking.hasProof}
        />
      </div>

      <dl className="text-body grid grid-cols-[minmax(0,6rem)_1fr] gap-x-3 gap-y-2">
        {withCustomer ? (
          <>
            <dt className="text-label text-muted-foreground">Player</dt>
            <dd className="break-words">{booking.customerName}</dd>

            <dt className="text-label text-muted-foreground">Phone</dt>
            <dd>
              {booking.customerPhone ? (
                <a
                  href={telHref(booking.customerPhone)}
                  className="text-link inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"
                >
                  <PhoneIcon aria-hidden="true" className="size-4" />
                  <span className="tabular-nums">{booking.customerPhone}</span>
                </a>
              ) : (
                cleared
              )}
            </dd>
          </>
        ) : null}

        <dt className="text-label text-muted-foreground">Email</dt>
        <dd className="break-words select-all">{booking.customerEmail ?? cleared}</dd>

        <dt className="text-label text-muted-foreground">
          {booking.runs.length === 1 ? "Court" : "Courts"}
        </dt>
        <dd>
          {booking.runs.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <ul className="flex flex-col gap-1 tabular-nums">
              {booking.runs.map((run) => (
                <li key={`${run.courtId}@${run.startsAt}`}>{formatRun(run, timeZone)}</li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      <History events={booking.events} timeZone={timeZone} />
    </div>
  );
}

/** "Turned down by Ana · Sat 31 Oct, 9:05am · Amount doesn't match". */
export function eventLine(event: BookingEventView, timeZone: string): string {
  const at = formatEventStamp(event.at, timeZone);
  switch (event.kind) {
    case "confirmed":
      return `Confirmed by ${event.staffName} · ${at}`;
    case "rejected":
      return `Turned down by ${event.staffName} · ${at} · ${reasonLabel(event.reason ?? "")}${
        event.refundOwed ? " · Refund owed" : ""
      }`;
    case "cancelled":
      return `Cancelled by ${event.staffName} · ${at} · ${reasonLabel(event.reason ?? "")}${
        event.refundOwed ? " · Refund owed" : ""
      }`;
    case "refunded":
      return `Refunded ${formatAmount(event.amount ?? 0)} by ${event.staffName} · ${at}`;
    case "refund_not_owed":
      return `No refund needed, by ${event.staffName} · ${at}`;
  }
}

function History({ events, timeZone }: { events: readonly BookingEventView[]; timeZone: string }) {
  return (
    <section aria-labelledby="online-booking-history">
      <h4 id="online-booking-history" className="text-label text-muted-foreground mb-2">
        History
      </h4>
      {events.length === 0 ? (
        <p className="text-caption text-muted-foreground">No decisions yet.</p>
      ) : (
        <ol className="border-border flex flex-col gap-3 border-l pl-3">
          {events.map((event) => (
            <li key={event.id} className="text-body">
              <p>{eventLine(event, timeZone)}</p>
              {event.note ? (
                <p className="text-caption text-muted-foreground mt-0.5 break-words">
                  {event.note}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
