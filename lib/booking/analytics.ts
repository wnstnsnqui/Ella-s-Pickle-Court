import type { EventProperties } from "@/lib/analytics/properties";

/**
 * The counts the checkout's analytics events carry (spec 0015, AC-24). Pure,
 * so they are tested without the Server Actions. Counts only: nothing here
 * can name a player, a court's customer, or a code.
 */

/** `online_booking_held`: how many hours, on how many courts, how far ahead. */
export function heldEventProperties(
  picks: readonly { courtId: number }[],
  daysAhead: number,
): EventProperties<"online_booking_held"> {
  return {
    slots: picks.length,
    courts: new Set(picks.map((pick) => pick.courtId)).size,
    // A day already past is refused by the hold before this runs; never negative anyway.
    days_ahead: Math.max(0, daysAhead),
  };
}

/** How many slots a booking's runs cover, at the venue's slot length. At least one. */
export function countSlots(
  runs: readonly { starts_at: string; ends_at: string }[],
  slotMinutes: number,
): number {
  const minutes = runs.reduce(
    (total, run) => total + (Date.parse(run.ends_at) - Date.parse(run.starts_at)) / 60_000,
    0,
  );
  return Math.max(1, Math.round(minutes / slotMinutes));
}
