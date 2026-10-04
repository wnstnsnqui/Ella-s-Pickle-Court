import type { Metadata } from "next";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { BookingLookup } from "@/components/receipt/booking-lookup";
import { checkoutEnabled } from "@/lib/booking/switch";

/**
 * Find your booking. Spec 0017.
 *
 * A player types the code from their receipt and sees where their booking
 * stands. The page itself holds no booking: the result arrives through the
 * `lookupBooking` Server Action, so the code never sits in a URL and no
 * crawler ever receives a result (AC-1, AC-11). Kept out of search with
 * `noindex`, and out of the sitemap, but never disallowed in `robots.txt`,
 * so a crawler can read the noindex.
 *
 * Renders per request, because the top bar's "Find my booking" link follows
 * the checkout switch. The page always works, whatever the switch.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find your booking",
  description: "Type the code from your receipt to see where your booking stands.",
  robots: { index: false, follow: false },
};

export default function BookingPage() {
  const checkout = checkoutEnabled();
  return (
    <div data-landing className="flex min-h-full flex-col">
      <LandingHeader findBooking={checkout} />
      <main className="bg-muted/50 flex-1 print:bg-transparent">
        <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16 print:max-w-none print:p-0">
          <BookingLookup />
        </div>
      </main>
      <LandingFooter findBooking={checkout} />
    </div>
  );
}
