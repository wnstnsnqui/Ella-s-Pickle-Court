"use client";

import { GlobeIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBookingCode } from "@/lib/booking/code";
import { loadStaffBooking } from "@/lib/schedule/actions";
import type { StaffBooking } from "@/lib/schedule/queries";

import { BOOKING_STATUS_LABEL, formatStamp } from "./format";

type Load =
  | { state: "loading" }
  | { state: "loaded"; booking: StaffBooking }
  | { state: "failed"; message: string };

/**
 * The Online booking block in the staff details sheet. Spec 0015, AC-21.
 *
 * Read when the sheet opens on a row with a `booking_id`, and again when the
 * row itself changes (`changedAt`), so a hold that becomes a submitted
 * booking while the sheet is open reads the new state. The board's cell
 * styling is feature 17's; this block only says where the booking stands.
 */
export function OnlineBookingBlock({
  bookingId,
  changedAt,
  timeZone,
}: {
  bookingId: number;
  changedAt: string;
  timeZone: string;
}) {
  const [attempt, setAttempt] = useState(0);
  // The latest answer and which request it answered. The sheet keys this
  // block by `bookingId`, so only a row change or a retry asks again.
  const [answer, setAnswer] = useState<{ key: string; load: Load } | null>(null);
  const key = `${changedAt}:${attempt}`;

  useEffect(() => {
    let live = true;
    loadStaffBooking({ bookingId })
      .then((result) => {
        if (!live) return;
        setAnswer({
          key,
          load: result.ok
            ? { state: "loaded", booking: result.data }
            : { state: "failed", message: result.error.message },
        });
      })
      .catch(() => {
        if (live) {
          setAnswer({
            key,
            load: { state: "failed", message: "The online booking did not load." },
          });
        }
      });
    return () => {
      live = false;
    };
  }, [bookingId, key]);

  // While a newer answer is on its way, a loaded booking stays on screen
  // rather than flashing back to loading; a failure gives way to loading.
  const load: Load =
    answer && (answer.key === key || answer.load.state === "loaded")
      ? answer.load
      : { state: "loading" };

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
        <p className="text-caption text-muted-foreground">Loading the online booking…</p>
      ) : null}

      {load.state === "failed" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-label text-destructive flex items-start gap-2">
            <WarningIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{load.message}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {load.state === "loaded" ? (
        <dl className="text-body grid grid-cols-[minmax(0,7rem)_1fr] gap-x-4 gap-y-3">
          <dt className="text-label text-muted-foreground">State</dt>
          <dd>
            <Badge variant={load.booking.status === "pending_check" ? "default" : "secondary"}>
              {BOOKING_STATUS_LABEL[load.booking.status]}
            </Badge>
          </dd>

          <dt className="text-label text-muted-foreground">Code</dt>
          <dd className="font-mono tabular-nums">{formatBookingCode(load.booking.code)}</dd>

          <dt className="text-label text-muted-foreground">Email</dt>
          <dd className="break-words">
            {load.booking.customerEmail ?? <span className="text-muted-foreground">Cleared</span>}
          </dd>

          <dt className="text-label text-muted-foreground">Reference</dt>
          <dd>
            {load.booking.referenceLast4 ? (
              <span className="tabular-nums">Ending {load.booking.referenceLast4}</span>
            ) : (
              <span className="text-muted-foreground">
                {load.booking.submittedAt ? "Cleared" : "Not sent yet"}
              </span>
            )}
          </dd>

          {load.booking.submittedAt ? (
            <>
              <dt className="text-label text-muted-foreground">Sent</dt>
              <dd className="tabular-nums">{formatStamp(load.booking.submittedAt, timeZone)}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
