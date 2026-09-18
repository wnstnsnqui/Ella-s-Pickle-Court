import { X } from "lucide-react";
import Link from "next/link";

import { firstName } from "@/components/staff/format";
import { Button } from "@/components/ui/button";
import type { DayReservation } from "@/lib/report/queries";
import { formatAtVenue, formatDayHeading } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Every booking, closure and cancellation on one day. Spec 0008, AC-8. */
export function DaySection({
  day,
  reservations,
  closeHref,
}: {
  day: string;
  reservations: readonly DayReservation[];
  closeHref: string;
}) {
  return (
    <section
      aria-labelledby="day-section-heading"
      className="border-border bg-card rounded-lg border p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="day-section-heading" className="text-title">
          {formatDayHeading(day)}
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={closeHref}>
            <X aria-hidden="true" />
            Close
          </Link>
        </Button>
      </div>
      {reservations.length === 0 ? (
        <p className="text-body text-muted-foreground">Nothing on the schedule this day.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {reservations.map((reservation) => {
            const cancelled = reservation.status === "cancelled";
            return (
              <li
                key={reservation.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className={cn(cancelled && "text-muted-foreground line-through")}>
                  <span className="text-label font-medium">{reservation.courtName}</span>
                  <span className="text-body ml-2 tabular-nums">
                    {reservation.startTime}–{reservation.endTime}
                  </span>
                  <span className="text-body ml-2">
                    {reservation.kind === "closed"
                      ? `Closed${reservation.note ? `: ${reservation.note}` : ""}`
                      : reservation.customerName}
                  </span>
                </div>
                <div className="text-caption text-muted-foreground flex flex-wrap gap-x-1">
                  {cancelled ? (
                    <span>
                      Cancelled
                      {reservation.cancelledByName ? ` by ${reservation.cancelledByName}` : ""}
                      {reservation.cancelledAt
                        ? ` · ${formatAtVenue(reservation.cancelledAt, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </span>
                  ) : reservation.createdByName ? (
                    <span>Booked by {firstName(reservation.createdByName)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
