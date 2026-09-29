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
 * Bumping this makes every staff member see the acknowledgement dialog again,
 * on their next visit to `/staff` (spec 0010, AC-12). ISO date string.
 */
export const PRIVACY_NOTICE_VERSION = "2026-09-21";
