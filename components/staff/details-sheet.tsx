"use client";

import { Ban, CalendarCheck, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StaffName, StaffReservation } from "@/lib/schedule/queries";

import { BoardSheet } from "./board-sheet";
import {
  formatDayOf,
  formatPeso,
  formatRange,
  formatStamp,
  PAYMENT_LABEL,
  staffDisplayName,
  telHref,
} from "./format";

/**
 * Who has this court. Spec 0005, AC-7, AC-9 and AC-11.
 *
 * One sheet for a booking and for a closure, because they are the same row
 * with different fields filled in. The buttons at the foot are conveniences:
 * whether the person may actually change a row that has ended is decided by
 * the update policy in Postgres, and a refusal comes back as a toast.
 */
export function DetailsSheet({
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
}: {
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
}) {
  if (!reservation) return null;
  const booking = reservation.kind === "booking";
  const day = formatDayOf(reservation.startsAt, timeZone);
  const changed = reservation.updatedAt !== reservation.createdAt;

  return (
    <BoardSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={booking ? (reservation.customerName ?? "Booking") : "Court closed"}
      description={`${courtName} · ${day} · ${formatRange(reservation.startsAt, reservation.endsAt, timeZone)}`}
      footer={
        canChange ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onEdit} className="flex-1">
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button type="button" variant="destructive" onClick={onCancel} className="flex-1">
              {booking ? <Trash2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
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
      <dl className="text-body grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-3">
        <dt className="text-label text-muted-foreground">Status</dt>
        <dd>
          <Badge variant={booking ? "default" : "secondary"}>
            {booking ? <CalendarCheck aria-hidden="true" /> : <Ban aria-hidden="true" />}
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
                  className="text-primary inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                >
                  <Phone aria-hidden="true" className="size-4" />
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

      <Separator className="my-4" />

      <div className="text-caption text-muted-foreground flex flex-col gap-1">
        <p>
          {booking ? "Booked" : "Closed"} by {staffDisplayName(staff, reservation.createdBy)} at{" "}
          {formatStamp(reservation.createdAt, timeZone)}
        </p>
        {changed ? (
          <p>
            Last changed by {staffDisplayName(staff, reservation.changedBy)} at{" "}
            {formatStamp(reservation.updatedAt, timeZone)}
          </p>
        ) : null}
      </div>
    </BoardSheet>
  );
}
