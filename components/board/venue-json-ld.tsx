import { DAY_NAMES, groupOpeningHours } from "@/lib/schedule/hours";
import type { VenueHours } from "@/lib/schedule/queries";
import {
  isPlaceholder,
  VENUE_CITY,
  VENUE_COUNTRY,
  VENUE_LATITUDE,
  VENUE_LONGITUDE,
  VENUE_NAME,
  VENUE_POSTAL_CODE,
  VENUE_REGION,
  VENUE_STREET,
} from "@/lib/venue";

/**
 * The venue as a place, for a search result. Spec 0006, AC-11, moved to the
 * landing page by spec 0013, AC-20.
 *
 * Built from the same settings the page already read, so it stays true the
 * day the hours change. Nothing personal and no reservation data goes in it.
 */

/**
 * One opening hours entry per distinct pair of times, with every day that
 * shares that pair listed in it (spec 0007, AC-21), grouped by the same helper
 * the landing page's Visit card uses. Closed days are omitted rather than
 * emitted with null times. The street stays out while it is a placeholder.
 */
export function venueJsonLd(hours: VenueHours, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: VENUE_NAME,
    url,
    sport: "Pickleball",
    address: {
      "@type": "PostalAddress",
      ...(isPlaceholder(VENUE_STREET) ? {} : { streetAddress: VENUE_STREET }),
      addressLocality: VENUE_CITY,
      addressRegion: VENUE_REGION,
      postalCode: VENUE_POSTAL_CODE,
      addressCountry: VENUE_COUNTRY,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: VENUE_LATITUDE,
      longitude: VENUE_LONGITUDE,
    },
    openingHoursSpecification: groupOpeningHours(hours.days)
      .filter((group) => group.open !== null && group.close !== null)
      .map((group) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: group.days.map((day) => DAY_NAMES[day]),
        opens: group.open,
        closes: group.close,
      })),
  };
}

export function VenueJsonLd({ hours, url }: { hours: VenueHours; url: string }) {
  // `<` is escaped so a value could never close the script tag early.
  const json = JSON.stringify(venueJsonLd(hours, url)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
