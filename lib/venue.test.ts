import { describe, expect, it } from "vitest";

import { VENUE_ADDRESS as LEGAL_ADDRESS } from "@/lib/legal/constants";

import {
  formatPeso,
  isPlaceholder,
  PRICE_PER_HOUR,
  smsHref,
  VENUE_ADDRESS,
  VENUE_LOCALITY,
  VENUE_MAPS_URL,
  VENUE_EMAIL,
  VENUE_MESSENGER_URL,
  VENUE_PHONE_DISPLAY,
  VENUE_SMS_NUMBER,
  VENUE_STREET,
} from "./venue";

/**
 * Spec 0013, AC-19: the venue facts more than one page prints live once, the
 * confirmed ones are real and the rest are visibly bracketed placeholders.
 */

describe("venue facts (AC-19)", () => {
  it("keeps the confirmed values real: the street, Minglanilla, Cebu and ₱250 an hour", () => {
    expect(VENUE_STREET).toBe("Cadulawan Road, Guindaruhan");
    expect(VENUE_LOCALITY).toBe("Minglanilla, Cebu");
    expect(PRICE_PER_HOUR).toBe(250);
  });

  it("keeps the confirmed contact channels real", () => {
    expect(VENUE_MESSENGER_URL).toBe("https://web.facebook.com/profile.php?id=61592913459680");
    expect(VENUE_SMS_NUMBER).toBe("+639566220272");
    expect(VENUE_PHONE_DISPLAY).toBe("0956 622 0272");
    expect(VENUE_EMAIL).toBe("loriemariejaybual@gmail.com");
  });

  it("has no bracketed placeholder left among the venue facts", () => {
    for (const value of [
      VENUE_SMS_NUMBER,
      VENUE_MESSENGER_URL,
      VENUE_EMAIL,
      VENUE_STREET,
      VENUE_LOCALITY,
    ]) {
      expect(isPlaceholder(value)).toBe(false);
    }
  });

  it("gives the privacy page the very same address line as the landing page", () => {
    expect(LEGAL_ADDRESS).toBe(VENUE_ADDRESS);
    expect(VENUE_ADDRESS).toBe(`${VENUE_STREET}, ${VENUE_LOCALITY}`);
  });

  it("opens the venue's own Google Maps pin (AC-18)", () => {
    expect(VENUE_MAPS_URL).toBe("https://maps.app.goo.gl/8zUZb1AEXhSrJKWW7");
  });
});

describe("formatPeso", () => {
  it("prints whole pesos with thousands commas and no decimals", () => {
    expect(formatPeso(0)).toBe("₱0");
    expect(formatPeso(250)).toBe("₱250");
    expect(formatPeso(1000)).toBe("₱1,000");
    expect(formatPeso(1_250_000)).toBe("₱1,250,000");
  });

  it("rounds a fractional amount to the nearest peso", () => {
    expect(formatPeso(125.4)).toBe("₱125");
    expect(formatPeso(62.5)).toBe("₱63");
  });
});

describe("smsHref", () => {
  it("opens a plain text to the front desk when there is no message", () => {
    expect(smsHref()).toBe(`sms:${VENUE_SMS_NUMBER}`);
    expect(smsHref("")).toBe(`sms:${VENUE_SMS_NUMBER}`);
  });

  it("prefills the body, encoded so spaces, commas and question marks survive", () => {
    const body = "Hi! Can I book Court 1 at 5pm and 6pm, Court 2 at 7pm on Sat 27 Sep?";
    const href = smsHref(body);
    expect(href.startsWith(`sms:${VENUE_SMS_NUMBER}?body=`)).toBe(true);
    expect(decodeURIComponent(href.split("?body=")[1])).toBe(body);
    expect(href.split("?body=")[1]).not.toMatch(/[ ,?]/);
  });
});
