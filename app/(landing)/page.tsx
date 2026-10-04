import type { Metadata } from "next";
import { headers } from "next/headers";

import { VenueJsonLd } from "@/components/board/venue-json-ld";
import { BookingSection } from "@/components/landing/booking-section";
import { Hero } from "@/components/landing/hero";
import {
  heroBoardForToday,
  heroBoardForTomorrow,
  type HeroBoardData,
} from "@/components/landing/hero-data";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { Location } from "@/components/landing/location";
import { Offers } from "@/components/landing/offers";
import { checkoutEnabled } from "@/lib/booking/switch";
import { PUBLIC_READ_LIMITED_HEADER } from "@/lib/rate-limit";
import { earliestOpen } from "@/lib/schedule/hours";
import { getSchedule, type Schedule } from "@/lib/schedule/queries";
import { addDays } from "@/lib/time";
import { VENUE_LOCALITY, VENUE_NAME } from "@/lib/venue";

/**
 * The landing page. Spec 0013.
 *
 * The venue's front door: what it is, what it offers, a live look at the
 * courts with a way to ask for hours, and where to find it. Today is read once
 * here, on the anonymous client, and every section that shows the schedule
 * (the hero board and stats, the booking section, the Visit hours, the
 * JSON-LD) shares that one read. A page whose value is being current renders
 * per request.
 *
 * It never shows an error (AC-10). A failed read leaves each live section out
 * or hands it to the browser to try again; over the shared rate limit the read
 * is skipped altogether (AC-11). Either way the failure is logged, not shown.
 */
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: { absolute: `${VENUE_NAME} · Pickleball courts in ${VENUE_LOCALITY}` },
  description: `Pickleball courts in ${VENUE_LOCALITY}: see which courts are free right now and message us to book.`,
  alternates: { canonical: "/" },
};

/** Today's read, or null when it failed or the limit said to skip it. */
async function readToday(limited: boolean): Promise<Schedule | null> {
  if (limited) {
    console.warn("landing: over the public read limit, skipped the schedule read");
    return null;
  }
  const result = await getSchedule();
  if (result.ok) return result.data;
  // `getSchedule()` has already reported a `failed` read to PostHog (AC-23).
  console.error(`landing: today's schedule read failed (${result.error.kind})`);
  return null;
}

/**
 * Today's next hours, or tomorrow's first ones when today has none left. The
 * second read happens only in that case, and only inside the horizon (AC-15).
 */
async function heroBoard(today: Schedule): Promise<HeroBoardData | null> {
  const board = heroBoardForToday(today.grid, today.now);
  if (board || today.horizonDays < 1) return board;
  const tomorrow = await getSchedule(addDays(today.grid.date, 1));
  return tomorrow.ok ? heroBoardForTomorrow(tomorrow.data.grid) : null;
}

export default async function Landing() {
  const checkout = checkoutEnabled();
  const limited = (await headers()).get(PUBLIC_READ_LIMITED_HEADER) === "1";
  const today = await readToday(limited);
  const board = today ? await heroBoard(today) : null;

  return (
    <div data-landing className="flex min-h-full flex-col">
      {today ? <VenueJsonLd hours={today.hours} url={SITE_URL} /> : null}
      <LandingHeader findBooking={checkout} />
      <main className="flex-1">
        <Hero
          board={board}
          stats={{
            courts: today ? today.grid.courts.length : null,
            earliestOpen: today ? earliestOpen(today.hours.days) : null,
            hourlyRate: today ? today.hourlyRate : null,
          }}
        />
        <Offers hourlyRate={today ? today.hourlyRate : null} />
        <BookingSection initial={today} limited={limited} checkout={checkout} />
        <Location hours={today?.hours ?? null} />
      </main>
      <LandingFooter findBooking={checkout} />
    </div>
  );
}
