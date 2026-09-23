import type { VenueHours } from "@/lib/schedule/queries";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The venue as a place, for a search result. Spec 0006, AC-11.
 *
 * Built from the same settings the page already read, so it stays true the
 * day the hours change. Nothing personal and no reservation data goes in it.
 */
/** Indexed by `day_of_week`, so `0` is Sunday, as the table stores it. */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Monday first through Sunday, the order the days are listed in (AC-21). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * One entry per distinct pair of times, with every day that shares that pair
 * listed in it (spec 0007, AC-21). A venue open the same hours all week emits
 * one entry; a late Friday emits two. Closed days are omitted rather than
 * emitted with null times, and days sharing a pair need not be next to each
 * other.
 */
export function venueJsonLd(hours: VenueHours, url: string) {
  const byPair = new Map<string, { opens: string; closes: string; days: number[] }>();

  for (const dayOfWeek of WEEK_ORDER) {
    const day = hours.days.find((entry) => entry.dayOfWeek === dayOfWeek);
    if (!day || day.open === null || day.close === null) continue;
    const key = `${day.open}|${day.close}`;
    const entry = byPair.get(key);
    if (entry) entry.days.push(dayOfWeek);
    else byPair.set(key, { opens: day.open, closes: day.close, days: [dayOfWeek] });
  }

  // Insertion order is already Monday first by earliest listed day, because
  // the loop walks the week in that order, so the block diffs cleanly.
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: VENUE_NAME,
    url,
    sport: "Pickleball",
    openingHoursSpecification: [...byPair.values()].map((entry) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: entry.days.map((day) => DAY_NAMES[day]),
      opens: entry.opens,
      closes: entry.closes,
    })),
  };
}

export function VenueJsonLd({ hours, url }: { hours: VenueHours; url: string }) {
  // `<` is escaped so a value could never close the script tag early.
  const json = JSON.stringify(venueJsonLd(hours, url)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
