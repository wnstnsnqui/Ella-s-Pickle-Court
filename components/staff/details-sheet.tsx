"use client";

import {
  ArrowCounterClockwiseIcon,
  CalendarCheckIcon,
  PencilSimpleIcon,
  PhoneIcon,
  ProhibitIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StaffName, StaffReservation } from "@/lib/schedule/queries";

import { BoardSheet } from "@/components/board-sheet";
import {
  formatDayOf,
  formatPeso,
  formatRange,
  formatStamp,
  PAYMENT_LABEL,
  telHref,
  writerLabel,
} from "./format";
import { OnlineBookingBody, OnlineBookingFooter } from "./online-booking-sheet";
import { useOnlineBooking, type OnlineBookingController } from "./use-online-booking";

/**
 * Who has this court. Spec 0005, AC-7, AC-9 and AC-11.
 *
 * One sheet for a booking and for a closure, because they are the same row
 * with different fields filled in. The buttons at the foot are conveniences:
 * whether the person may actually change a row that has ended is decided by
 * the update policy in Postgres, and a refusal comes back as a toast.
 *
 * A row of an online booking (spec 0016) loads its booking here and the
 * sheet owns its footer: the check's own buttons, never the board's row
 * cancel, because an online booking ends whole or not at all (AC-10).
 */

type DetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: StaffReservation | null;
  courtName: string;
  timeZone: string;
  staff: readonly StaffName[];
  /** Ended rows are the owner's to change (AC-11). */
  canChange: boolean;
  onEdit: () => void;
  onCancel: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** Moves on every live read, so an open online booking reads itself again. */
  liveTick: number;
  /** After a decision on an online booking landed. */
  onOnlineDecided: (kind: "confirmed" | "rejected" | "cancelled" | "settled") => void;
  /** True while a decision on an online booking is in flight. */
  onOnlineBusy: (busy: boolean) => void;
};

export function DetailsSheet(props: DetailsProps) {
  const { reservation } = props;
  if (!reservation) return null;
  if (reservation.kind === "booking" && reservation.bookingId !== null) {
    return (
      <OnlineRowSheet
        key={reservation.bookingId}
        {...props}
        reservation={reservation}
        bookingId={reservation.bookingId}
      />
    );
  }
  return <RowSheet {...props} reservation={reservation} />;
}

function RowSheet({
  open,
  onOpenChange,
  reservation,
  courtName,
  timeZone,
  staff,
  canChange,
  onEdit,
  onCancel,
  returnFocusTo,
}: DetailsProps & { reservation: StaffReservation }) {
  const booking = reservation.kind === "booking";
  const day = formatDayOf(reservation.startsAt, timeZone);

  return (
    <BoardSheet
      icon={CalendarCheckIcon}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={booking ? (reservation.customerName ?? "Booking") : "Court closed"}
      description={`${courtName} · ${day} · ${formatRange(reservation.startsAt, reservation.endsAt, timeZone)}`}
      footer={
        canChange ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onEdit} className="flex-1">
              <PencilSimpleIcon aria-hidden="true" />
              Edit
            </Button>
            <Button type="button" variant="destructive" onClick={onCancel} className="flex-1">
              {booking ? (
                <TrashIcon aria-hidden="true" />
              ) : (
                <ArrowCounterClockwiseIcon aria-hidden="true" />
              )}
              {booking ? "Cancel booking" : "Reopen court"}
            </Button>
          </div>
        ) : (
          <p role="status" className="text-caption text-muted-foreground text-center">
            Ask Ella to change a past booking.
          </p>
        )
      }
    >
      <RowFacts reservation={reservation} courtName={courtName} timeZone={timeZone} />
      <Separator className="my-4" />
      <Writers reservation={reservation} staff={staff} timeZone={timeZone} />
    </BoardSheet>
  );
}

function OnlineRowSheet({
  open,
  onOpenChange,
  reservation,
  bookingId,
  courtName,
  timeZone,
  staff,
  canChange,
  onEdit,
  returnFocusTo,
  liveTick,
  onOnlineDecided,
  onOnlineBusy,
}: DetailsProps & { reservation: StaffReservation; bookingId: number }) {
  const controller: OnlineBookingController = useOnlineBooking({
    bookingId,
    changeKey: `${reservation.updatedAt}:${liveTick}`,
    onDecided: onOnlineDecided,
    onBusy: onOnlineBusy,
  });
  const day = formatDayOf(reservation.startsAt, timeZone);

  return (
    <BoardSheet
      icon={CalendarCheckIcon}
      open={open}
      onOpenChange={(next) => !controller.pending && onOpenChange(next)}
      returnFocusTo={returnFocusTo}
      focusOnOpen={false}
      title={reservation.customerName ?? "Booking"}
      description={`${courtName} · ${day} · ${formatRange(reservation.startsAt, reservation.endsAt, timeZone)}`}
      footer={
        <OnlineBookingFooter controller={controller} onEdit={canChange ? onEdit : undefined} />
      }
    >
      {controller.step ? null : (
        <>
          <RowFacts reservation={reservation} courtName={courtName} timeZone={timeZone} />
          <Separator className="my-4" />
        </>
      )}
      <OnlineBookingBody controller={controller} timeZone={timeZone} withCustomer={false} />
      {controller.step ? null : (
        <>
          <Separator className="my-4" />
          <Writers reservation={reservation} staff={staff} timeZone={timeZone} />
        </>
      )}
    </BoardSheet>
  );
}

function RowFacts({
  reservation,
  courtName,
  timeZone,
}: {
  reservation: StaffReservation;
  courtName: string;
  timeZone: string;
}) {
  const booking = reservation.kind === "booking";
  const day = formatDayOf(reservation.startsAt, timeZone);

  return (
    <dl className="text-body grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-3">
      <dt className="text-label text-muted-foreground">Status</dt>
      <dd>
        <Badge variant={booking ? "default" : "secondary"}>
          {booking ? <CalendarCheckIcon aria-hidden="true" /> : <ProhibitIcon aria-hidden="true" />}
          {booking ? "Booked" : "Unavailable"}
        </Badge>
      </dd>

      {booking ? (
        <>
          <dt className="text-label text-muted-foreground">Customer</dt>
          <dd className="break-words">{reservation.customerName}</dd>

          <dt className="text-label text-muted-foreground">Phone</dt>
          <dd>
            {reservation.customerPhone ? (
              <a
                href={telHref(reservation.customerPhone)}
                className="text-link inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <PhoneIcon aria-hidden="true" className="size-4" />
                <span className="tabular-nums">{reservation.customerPhone}</span>
              </a>
            ) : (
              <span className="text-muted-foreground">None given</span>
            )}
          </dd>

          <dt className="text-label text-muted-foreground">Payment</dt>
          <dd>
            {PAYMENT_LABEL[reservation.paymentStatus]}
            {reservation.amount !== null ? (
              <span className="tabular-nums"> · {formatPeso(reservation.amount)}</span>
            ) : null}
          </dd>
        </>
      ) : null}

      <dt className="text-label text-muted-foreground">Court</dt>
      <dd>{courtName}</dd>

      <dt className="text-label text-muted-foreground">When</dt>
      <dd className="tabular-nums">
        {day}, {formatRange(reservation.startsAt, reservation.endsAt, timeZone)}
      </dd>

      <dt className="text-label text-muted-foreground">Note</dt>
      <dd className="break-words">
        {reservation.note ?? <span className="text-muted-foreground">None</span>}
      </dd>
    </dl>
  );
}

function Writers({
  reservation,
  staff,
  timeZone,
}: {
  reservation: StaffReservation;
  staff: readonly StaffName[];
  timeZone: string;
}) {
  const booking = reservation.kind === "booking";
  const changed = reservation.updatedAt !== reservation.createdAt;
  return (
    <div className="text-caption text-muted-foreground flex flex-col gap-1">
      <p>
        {booking ? "Booked" : "Closed"}{" "}
        {writerLabel(staff, reservation.createdBy, reservation.bookingId)} at{" "}
        {formatStamp(reservation.createdAt, timeZone)}
      </p>
      {changed ? (
        <p>
          Last changed {writerLabel(staff, reservation.changedBy, reservation.bookingId)} at{" "}
          {formatStamp(reservation.updatedAt, timeZone)}
        </p>
      ) : null}
    </div>
  );
}
