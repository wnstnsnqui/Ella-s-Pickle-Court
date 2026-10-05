/**
 * The venue's own name, voice and facts, in one place.
 *
 * Spec 0003, Value sourcing: `venue_settings` has no name column, so the name is
 * a constant rather than a database read. Renaming the venue without a deploy is
 * on the Deferred list and is a change to spec 0002, not to this file.
 *
 * Spec 0013, AC-19: every fact more than one page prints (the address, the
 * contact channels, the hourly price) lives here once, so the landing page and
 * the privacy page can never disagree. A value not yet confirmed real is a
 * bracketed placeholder, so an unfinished page is obviously unfinished. Ella
 * supplies the real ones (spec 0013, Follow-up).
 */
export const VENUE_NAME = "Ella's Pickle Court";

/** The short line under the wordmark and in the page description. */
export const VENUE_TAGLINE = "See which courts are free before you drive over.";

/** The letter the generated favicon and the wordmark mark are set from. */
export const VENUE_INITIAL = "E";

/** Confirmed real. The town and province, the parts of the address that are known. */
export const VENUE_CITY = "Minglanilla";
export const VENUE_REGION = "Cebu";
export const VENUE_COUNTRY = "PH";
export const VENUE_LOCALITY = `${VENUE_CITY}, ${VENUE_REGION}`;

/** Confirmed real (2026-10-05): the venue's purok and barangay. */
export const VENUE_STREET = "Purok 13 Cadulawan";

/** Confirmed real: Minglanilla's postal code. */
export const VENUE_POSTAL_CODE = "6046";

/** The country, spelled out for the printed address. */
export const VENUE_COUNTRY_NAME = "Philippines";

/**
 * The name the venue's pin carries on Google Maps, which is not the venue's own
 * name, so a player following directions recognises the place they arrive at.
 */
export const VENUE_MAPS_LABEL = "RELLM BASKETBALL COURT";

/** Confirmed real: the venue's pin, for the JSON-LD. */
export const VENUE_LATITUDE = 10.2691812;
export const VENUE_LONGITUDE = 123.7750599;

/** The town line of the address: `Minglanilla, Cebu 6046, Philippines`. */
export const VENUE_TOWN_LINE = `${VENUE_LOCALITY} ${VENUE_POSTAL_CODE}, ${VENUE_COUNTRY_NAME}`;

/** The one address line every page prints. */
export const VENUE_ADDRESS = `${VENUE_STREET}, ${VENUE_TOWN_LINE}`;

/** Whether a venue fact is still a placeholder rather than the real value. */
export function isPlaceholder(value: string): boolean {
  return value.includes("[");
}

/** Confirmed real: the venue's own place on Google Maps, so "Open in Maps" lands on the pin. */
export const VENUE_MAPS_URL = "https://maps.app.goo.gl/8zUZb1AEXhSrJKWW7";

/** Confirmed real: the venue's Facebook page, where the Messenger links land. */
export const VENUE_MESSENGER_URL = "https://web.facebook.com/profile.php?id=61592913459680";

/** Confirmed real: the front desk mobile the Text us links open, in international form. */
export const VENUE_SMS_NUMBER = "+639566220272";

/** The same mobile, written the way a Filipino reader expects to see it. */
export const VENUE_PHONE_DISPLAY = "0956 622 0272";

/** Confirmed real: the venue's email address. */
export const VENUE_EMAIL = "loriemariejaybual@gmail.com";

/**
 * The account the venue's QR Ph code pays, shown beside the code at checkout
 * (spec 0015, AC-8). A placeholder until Ella supplies it; checkout stays off
 * while it is one (AC-26, build plan task 5).
 */
export const PAYMENT_ACCOUNT_NAME = "Lorie Marie Bual";

/**
 * The venue's QR Ph image, served from `public/` (spec 0015, AC-8). A
 * placeholder until Ella supplies it; the Payment step draws a marked empty
 * frame in its place rather than a broken image.
 */
export const PAYMENT_QR_SRC = "/image.png";

/** An `sms:` link to the front desk, with the message already written when given one. */
export function smsHref(body?: string): string {
  const to = `sms:${VENUE_SMS_NUMBER}`;
  return body ? `${to}?body=${encodeURIComponent(body)}` : to;
}

/**
 * An `sms:` link to a player, with the message already written (spec 0016,
 * AC-9). The same `?body=` form as `smsHref`, which is the venue's own number.
 */
export function smsToHref(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent(body)}`;
}

/** Whole pesos, comma grouped, no decimals: `₱1,000`. */
export function formatPeso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-US")}`;
}
