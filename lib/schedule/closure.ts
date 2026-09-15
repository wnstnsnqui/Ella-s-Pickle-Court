import { localEndTimeInZone } from "@/lib/time";

import type { Grid } from "./grid";
import type { StaffReservation } from "./queries";

/**
 * Where a closure may end. Spec 0005, AC-8 value sourcing.
 *
 * Every slot end on that court after the closure's start, walking down the
 * day until the first slot that somebody else holds (a booking, or another
 * closure) or the closing time. The closure's own slots count as free, which
 * is what lets it be shortened as well as extended.
 */
export type EndOption = {
  /** `HH:mm` at the venue, what the action receives. */
  time: string;
  /** The UTC instant, for a stable key and a label. */
  endsAt: string;
};

export function closureEndOptions(
  grid: Grid,
  reservations: readonly StaffReservation[],
  closure: StaffReservation,
): EndOption[] {
  const start = Date.parse(closure.startsAt);
  const others = reservations.filter(
    (row) => row.id !== closure.id && row.status === "active" && row.courtId === closure.courtId,
  );
  const options: EndOption[] = [];

  for (const row of grid.rows) {
    if (row.outOfHours) continue;
    const rowStart = Date.parse(row.startsAt);
    const rowEnd = Date.parse(row.endsAt);
    if (rowEnd <= start) continue;
    const taken = others.some(
      (other) => Date.parse(other.startsAt) < rowEnd && rowStart < Date.parse(other.endsAt),
    );
    if (taken) break;
    options.push({ time: localEndTimeInZone(row.endsAt, grid.timezone), endsAt: row.endsAt });
  }

  return options;
}
