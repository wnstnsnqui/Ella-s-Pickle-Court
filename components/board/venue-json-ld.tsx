import type { VenueHours } from "@/lib/schedule/queries";
import { VENUE_NAME } from "@/lib/venue";

/**
 * The venue as a place, for a search result. Spec 0006, AC-11.
 *
 * Built from the same settings the page already read, so it stays true the
 * day the hours change. Nothing personal and no reservation data goes in it.
 */
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKEND = ["Saturday", "Sunday"];

export function venueJsonLd(hours: VenueHours, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: VENUE_NAME,
    url,
    sport: "Pickleball",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: WEEKDAYS,
        opens: hours.weekdayOpen,
        closes: hours.weekdayClose,
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: WEEKEND,
        opens: hours.weekendOpen,
        closes: hours.weekendClose,
      },
    ],
  };
}

export function VenueJsonLd({ hours, url }: { hours: VenueHours; url: string }) {
  // `<` is escaped so a value could never close the script tag early.
  const json = JSON.stringify(venueJsonLd(hours, url)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
