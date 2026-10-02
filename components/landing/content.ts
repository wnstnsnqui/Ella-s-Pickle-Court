import { formatPeso, VENUE_LOCALITY } from "@/lib/venue";

/**
 * The landing page's own words. Spec 0013, AC-17 and AC-19.
 *
 * Only this page prints these, so they live beside its components rather than
 * in `lib/venue.ts`. The copy claims nothing that is not confirmed: the town,
 * the four amenities (confirmed 2026-09-26), and what the live schedule
 * does. The price is never written here: it is `venue_settings.hourly_rate`,
 * handed in from the schedule read (spec 0015, AC-17). Ella reads the whole page before launch (spec 0013,
 * Follow-up).
 */

export const HERO = {
  eyebrow: `Now open in ${VENUE_LOCALITY}`,
  title: "Your court is waiting.",
  lede: "See which courts are free right now, pick the hours you want, and message us to lock them in.",
} as const;

/**
 * The one priced offer, set in the dark mark colour so the eye lands there
 * first. Its price is `hourly_rate`, shown beside `unit` by the card.
 */
export type Offer = {
  name: string;
  unit: string;
  blurb: string;
  perks: string[];
};

export const RENTAL: Offer = {
  name: "Court rental",
  unit: "per hour",
  blurb: "A whole court for your group, booked by the hour.",
  perks: [
    "Check what's free on the live schedule",
    "Pick your hours right on this page",
    "Message us and we'll book it for you",
  ],
};

/** What comes with the court. Quiet tiles beside the rental card, in display order. */
export type Amenity = {
  id: "wifi" | "parking" | "comfort-rooms" | "outdoor";
  name: string;
  detail: string;
  badge?: string;
};

export const AMENITIES: Amenity[] = [
  { id: "wifi", name: "Guest wifi", badge: "Free", detail: "Stay connected between games." },
  { id: "parking", name: "Parking", badge: "Free", detail: "On site, so you can park and play." },
  { id: "comfort-rooms", name: "Comfort rooms", detail: "Right next to the courts." },
  {
    id: "outdoor",
    name: "Outdoor courts",
    badge: "Night play",
    detail: "Open air courts, lit for games after dark.",
  },
];

export const OFFERS_SECTION = {
  eyebrow: "Why play here",
  title: "Come for a game. Stay till the lights.",
} as const;

/**
 * The offers lede, priced from `hourly_rate`. With no read to vouch for a
 * price, the sentence simply leaves it out rather than guess.
 */
export function offersLede(hourlyRate: number | null): string {
  const price = hourlyRate === null ? "" : ` at ${formatPeso(hourlyRate)} an hour`;
  return `A whole court for your group${price}, with free wifi, free parking and comfort rooms right by the courts.`;
}

export const BOOKING_SECTION = {
  eyebrow: "Court booking",
  title: "Pick a day. Pick your hours. Play.",
  lede: "Every tile is the same schedule our staff keep current at the front desk. Pick the hours you want and send them our way.",
} as const;

export const VISIT_SECTION = {
  eyebrow: "Visit us",
  title: `Come play in ${VENUE_LOCALITY.split(",")[0]}.`,
  lede: `Find us in ${VENUE_LOCALITY}. Message us any time to book or ask about the courts.`,
  parking: "Free parking on site.",
} as const;

export const FOOTER_LINE = "A live court schedule, and a quick message away from your next game.";
