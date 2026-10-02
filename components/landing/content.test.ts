import { describe, expect, it } from "vitest";

import { isPlaceholder, VENUE_LOCALITY } from "@/lib/venue";

import { AMENITIES, HERO, OFFERS_SECTION, offersLede, RENTAL, VISIT_SECTION } from "./content";

/**
 * Spec 0013, AC-16, AC-17 and AC-19: the page's own words claim nothing that
 * is not confirmed. The four amenities were confirmed on 2026-09-26, so none
 * of them is a placeholder. The price is `hourly_rate` from the read (spec
 * 0015, AC-17), so no word here carries one of its own.
 */

describe("the offers (AC-17, AC-19)", () => {
  it("names court rental per hour, carrying no price of its own", () => {
    expect(RENTAL).toMatchObject({ name: "Court rental", unit: "per hour" });
    expect(RENTAL).not.toHaveProperty("price");
    expect(RENTAL.perks).toHaveLength(3);
  });

  it("lists the four amenities in order, with their badges", () => {
    expect(AMENITIES.map(({ name, badge }) => [name, badge])).toEqual([
      ["Guest wifi", "Free"],
      ["Parking", "Free"],
      ["Comfort rooms", undefined],
      ["Outdoor courts", "Night play"],
    ]);
  });

  it("opens with the new heading, the lede's price following hourly_rate", () => {
    expect(OFFERS_SECTION.eyebrow).toBe("Why play here");
    expect(OFFERS_SECTION.title).toBe("Come for a game. Stay till the lights.");
    expect(offersLede(250)).toBe(
      "A whole court for your group at ₱250 an hour, with free wifi, free parking and comfort rooms right by the courts.",
    );
    expect(offersLede(300)).toContain("at ₱300 an hour");
  });

  it("leaves the price out of the lede when the read is unavailable, never guessing one", () => {
    expect(offersLede(null)).toBe(
      "A whole court for your group, with free wifi, free parking and comfort rooms right by the courts.",
    );
  });

  it("claims no placeholder in the rental card, the amenities or the parking note", () => {
    const words = [
      RENTAL.name,
      RENTAL.unit,
      RENTAL.blurb,
      ...RENTAL.perks,
      ...AMENITIES.flatMap(({ name, detail, badge }) => [name, detail, badge ?? ""]),
      VISIT_SECTION.parking,
    ];
    expect(words.some(isPlaceholder)).toBe(false);
    expect(VISIT_SECTION.parking).toBe("Free parking on site.");
  });
});

describe("the hero words (AC-16)", () => {
  it("reads 'Now open in Minglanilla, Cebu' from the one locality", () => {
    expect(HERO.eyebrow).toBe(`Now open in ${VENUE_LOCALITY}`);
    expect(HERO.eyebrow).toBe("Now open in Minglanilla, Cebu");
  });
});
