import "server-only";

import { isPlaceholder, PAYMENT_ACCOUNT_NAME, PAYMENT_QR_SRC } from "@/lib/venue";

/** What the Payment step shows a player to pay against (AC-8). */
export type PaymentFacts = { accountName: string; qrSrc: string };

/**
 * Whether the landing page offers online checkout. Spec 0015, AC-26.
 *
 * Decided on the server, per request, and handed to the picker as a boolean,
 * never a secret. While it is off the button keeps "Request booking" and the
 * coming soon toast exactly (spec 0013, AC-13).
 *
 * The four checkout env values must all be set, and the account name and QR
 * image must be real rather than placeholders, so checkout cannot switch on
 * anywhere before every piece it needs is real. `payment` is there for the
 * tests; the page always uses the venue's own facts.
 */
export function checkoutEnabled(
  payment: PaymentFacts = { accountName: PAYMENT_ACCOUNT_NAME, qrSrc: PAYMENT_QR_SRC },
): boolean {
  const configured = [
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    process.env.TURNSTILE_SECRET,
    process.env.TURNSTILE_HOSTNAMES,
    process.env.BOOKING_CLIENT_HASH_SECRET,
  ].every((value) => Boolean(value?.trim()));
  return configured && !isPlaceholder(payment.accountName) && !isPlaceholder(payment.qrSrc);
}
