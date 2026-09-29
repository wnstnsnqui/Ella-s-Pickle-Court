import { describe, expect, it } from "vitest";

import { formatPeso, isPlaceholder, PRICE_PER_HOUR, VENUE_LOCALITY } from "@/lib/venue";

import { AMENITIES, HERO, OFFERS_SECTION, RENTAL, VISIT_SECTION } from "./content";

/**
 * Spec 0013, AC-16, AC-17 and AC-19: the page's own words claim nothing that
 * is not confirmed. Court rental is real at ₱250, and the four amenities were
 * confirmed on 2026-09-26, so none of them is a placeholder.
 */

describe("the offers (AC-17, AC-19)", () => {
  it("prices court rental at ₱250 per hour, from the one price", () => {
    expect(RENTAL).toMatchObject({ name: "Court rental", price: "₱250", unit: "per hour" });
    expect(RENTAL.price).toBe(formatPeso(PRICE_PER_HOUR));
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

  it("opens with the new heading, the lede's price following PRICE_PER_HOUR", () => {
    expect(OFFERS_SECTION.eyebrow).toBe("Why play here");
    expect(OFFERS_SECTION.title).toBe("Come for a game. Stay till the lights.");
    expect(OFFERS_SECTION.lede).toBe(
      `A whole court for your group at ${formatPeso(PRICE_PER_HOUR)} an hour, with free wifi, free parking and comfort rooms right by the courts.`,
    );
  });

  it("claims no placeholder in the rental card, the amenities or the parking note", () => {
    const words = [
      RENTAL.name,
      RENTAL.price,
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
