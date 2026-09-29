import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { smsHref, VENUE_ADDRESS, VENUE_MESSENGER_URL, VENUE_NAME } from "@/lib/venue";

import { LandingFooter } from "./landing-footer";

/**
 * Spec 0013, AC-19 and spec 0010: the footer groups its links in three named
 * navigations, reaches the legal pages and staff sign in, contacts the venue
 * through the same channels as the page, and prints the venue's name and
 * address from `lib/venue.ts`.
 */
const html = () => renderToStaticMarkup(createElement(LandingFooter));

describe("LandingFooter", () => {
  it("groups its links in three named navigations", () => {
    for (const label of ["Play", "Venue", "Legal"]) {
      expect(html()).toContain(`<nav aria-label="${label}"`);
    }
  });

  it("links the live board, the legal pages and staff sign in", () => {
    const page = html();
    expect(page).toMatch(/href="\/schedule"[^>]*>Live schedule</);
    expect(page).toMatch(/href="\/privacy"[^>]*>Privacy</);
    expect(page).toMatch(/href="\/terms"[^>]*>Terms</);
    expect(page).toMatch(/href="\/sign-in"[^>]*>Staff sign in</);
  });

  it("contacts the venue through Messenger and a text, as plain links", () => {
    const page = html();
    const messenger = VENUE_MESSENGER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(page).toMatch(new RegExp(`<a href="${messenger}"[^>]*>Messenger</a>`));
    expect(page).toContain(`href="${smsHref().replace(/&/g, "&amp;")}"`);
  });

  it("prints the year, the venue's name and its address", () => {
    const page = html();
    expect(page).toContain(`© ${new Date().getFullYear()} ${VENUE_NAME.replace("'", "&#x27;")}.`);
    expect(page).toContain(VENUE_ADDRESS);
  });
});
