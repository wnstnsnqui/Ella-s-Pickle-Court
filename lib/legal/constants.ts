/**
 * The single source for every fact `/privacy`, `/terms`, and the staff
 * acknowledgement dialog print. Spec 0010, AC-4.
 *
 * Placeholders are visibly marked so an unfinished page is obviously
 * unfinished rather than silently blank. Ella supplies the real values before
 * the public link is shared (spec 0010, Follow-up).
 */

export const VENUE_LEGAL_NAME = "[Venue legal name]";
export const PRIVACY_CONTACT_EMAIL = "[privacy contact email]";

/** Read from `lib/venue.ts` so the privacy page and the landing page agree (spec 0013, AC-19). */
export { VENUE_ADDRESS } from "@/lib/venue";

/** How many days after a booking's scheduled end its phone number is kept. */
export const PHONE_RETENTION_DAYS = 90;

/**
 * The online booking retention rules (spec 0015, AC-22, AC-23). Every number
 * here is also written into `purge_online_booking_details()` and
 * `payment_proofs_due()`, and `supabase/tests/online_booking_retention.test.ts`
 * seeds each boundary from these constants, so the page and the purge cannot
 * drift apart (invariant 8).
 */

/** Days after an online booking's last slot ends that its email is kept. */
export const EMAIL_RETENTION_DAYS = 90;

/** Days after an online booking's last slot ends that the transfer's reference digits are kept. */
export const REFERENCE_RETENTION_DAYS = 90;

/** Days a booking keeps the hashed connection address the spam limit counts by. */
export const CLIENT_HASH_RETENTION_DAYS = 1;

/** Days after staff check a payment that its screenshot is kept. */
export const PROOF_RETENTION_DAYS_AFTER_DECISION = 30;

/** Days after the last slot ends that a screenshot nobody checked is kept. */
export const PROOF_RETENTION_DAYS_UNCHECKED = 90;

/** Days after the hold that a screenshot for a booking never confirmed is kept. */
export const PROOF_RETENTION_DAYS_UNSUBMITTED = 1;

/**
 * Bumping this makes every staff member see the acknowledgement dialog again,
 * on their next visit to `/staff` (spec 0010, AC-12). ISO date string.
 */
export const PRIVACY_NOTICE_VERSION = "2026-09-30";

/**
 * The version of the booking rules and terms a player ticks at checkout. Stored
 * on every booking with the time the box was ticked (spec 0015, AC-22). The
 * action sets it, never the browser. Bump it whenever the rules change.
 * `2026-10-02`: the first rule now confirms at checkout (spec 0015, the
 * 2026-10-02 amendment); bookings made before keep `2026-09-30`.
 */
export const BOOKING_TERMS_VERSION = "2026-10-02";

/**
 * The booking rules a player agrees to at checkout, shown as a short list on
 * the Terms step and matched by the booking section of `/terms` (spec 0015,
 * AC-3, AC-22). A draft until Ella confirms the wording (spec 0015,
 * Follow-up); bump `BOOKING_TERMS_VERSION` whenever it changes.
 */
export const BOOKING_RULES = [
  "Your booking is confirmed when you finish checkout. Staff check every payment afterwards, and may cancel a booking whose payment doesn't match; we'll message you first, and refund anything you paid.",
  "Pay the exact amount shown by QR transfer, and keep your booking code.",
  "To change or cancel, or for a refund, message us on Messenger or by text.",
  "Please arrive on time. Your hours end when they end, even if you start late.",
] as const;
