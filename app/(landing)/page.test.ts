import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { manila, scheduleFixture, WEEK } from "@/components/landing/test-fixture";
import {
  VENUE_EMAIL,
  VENUE_MAPS_LABEL,
  VENUE_MESSENGER_URL,
  VENUE_PHONE_DISPLAY,
} from "@/lib/venue";

/**
 * Spec 0013: `/` renders per request from one read of today (AC-1, AC-2), both
 * courts side by side (AC-3), the hero on real data with its tomorrow fallback
 * (AC-15, AC-16), grouped hours on Visit (AC-18), metadata and JSON-LD
 * (AC-20). A failed read or an over limit request shows no error at all
 * (AC-10, AC-11, AC-23), and no private reservation field ever reaches the
 * HTML (AC-24).
 *
 * The whole page is rendered, client components included, the way the server
 * sends it; only the database read and the request headers are stood in for.
 */

const getSchedule = vi.hoisted(() => vi.fn());
const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("@/lib/schedule/queries", () => ({ getSchedule }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

const { default: Landing, metadata, dynamic } = await import("./page");

const render = async () => renderToStaticMarkup(await Landing());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  requestHeaders.value = new Headers();
  getSchedule.mockResolvedValue({ ok: true, data: scheduleFixture() });
});

/** Every word a visitor could read as failure, other than the AC-9 toast. */
const ERROR_WORDS = /error|went wrong|failed|status|digest|reference:|\b(429|500)\b/i;

describe("/ on a live read", () => {
  it("renders per request, reading today once, in the spec's order (AC-1, AC-2)", async () => {
    expect(dynamic).toBe("force-dynamic");
    const html = await render();
    expect(getSchedule).toHaveBeenCalledTimes(1);
    expect(getSchedule).toHaveBeenCalledWith();
    const order = ["hero-title", "offers-title", "book-title", "visit-title", "<footer"].map(
      (mark) => html.indexOf(mark),
    );
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
  });

  it("shows both courts side by side with named, pressable Free tiles (AC-3, AC-4)", async () => {
    const html = await render();
    expect(html).toMatch(/<th scope="col"[^>]*>Court 1<\/th><th scope="col"[^>]*>Court 2<\/th>/);
    expect(html).toContain('aria-label="Court 1 at 5pm. Free."');
    expect(html).toContain('aria-label="Court 2 at 9am. Past."');
    expect(html).not.toContain("Court 1 at 11pm");
  });

  it("says a closed day plainly, with no error words (AC-5)", async () => {
    const days = WEEK.map((d) => (d.dayOfWeek === 6 ? { ...d, open: null, close: null } : d));
    getSchedule.mockResolvedValueOnce({ ok: true, data: scheduleFixture({ days }) });
    getSchedule.mockResolvedValueOnce({ ok: true, data: scheduleFixture({ date: "2026-09-27" }) });
    const html = await render();
    expect(html).toContain("Closed on Sat 26 Sep");
    expect(html).not.toMatch(ERROR_WORDS);
  });

  it("puts the hero on real data: the board, the chip and the stats (AC-15, AC-16)", async () => {
    const html = await render();
    expect(html).toContain("As of 3:12pm");
    expect(html).toContain("Court 1 is free at 4pm");
    expect(html).toContain("Now open in Minglanilla, Cebu");
    expect(html).toMatch(/Courts<\/dt><dd[^>]*>2</);
    expect(html).toMatch(/Earliest serve<\/dt><dd[^>]*>6am</);
    expect(html).toContain("₱250");
  });

  it("reads tomorrow only after closing, and drops the board when tomorrow is closed (AC-15)", async () => {
    getSchedule.mockResolvedValueOnce({
      ok: true,
      data: scheduleFixture({ now: manila("2026-09-26", "22:30") }),
    });
    getSchedule.mockResolvedValueOnce({
      ok: true,
      data: scheduleFixture({ date: "2026-09-27" }),
    });
    let html = await render();
    expect(getSchedule).toHaveBeenLastCalledWith("2026-09-27");
    expect(html).toContain("Closed now · Tomorrow");

    const shut = WEEK.map((d) => (d.dayOfWeek === 0 ? { ...d, open: null, close: null } : d));
    getSchedule.mockResolvedValueOnce({
      ok: true,
      data: scheduleFixture({ now: manila("2026-09-26", "22:30") }),
    });
    getSchedule.mockResolvedValueOnce({
      ok: true,
      data: scheduleFixture({ date: "2026-09-27", days: shut }),
    });
    html = await render();
    expect(html).not.toContain("Court schedule</p>");
  });

  it("lists the real week on Visit, grouped, with Messenger and Text us only (AC-18)", async () => {
    const html = await render();
    expect(html).toMatch(/Monday to Sunday<\/dt><dd[^>]*>6am to 10pm/);
    expect(html).toContain("Purok 13 Cadulawan");
    expect(html).toContain("Minglanilla, Cebu 6046, Philippines");
    expect(html).toContain(VENUE_MAPS_LABEL);
    expect(html).not.toMatch(/href="(tel|mailto):/);
    expect(html).toContain('href="sms:');
    expect(html).toContain(VENUE_MESSENGER_URL);
    expect(html).toContain(VENUE_PHONE_DISPLAY);
    expect(html).toContain(VENUE_EMAIL);
  });

  it("embeds the venue as JSON-LD with the address and the hours (AC-20)", async () => {
    const html = await render();
    expect(html).toContain('"@type":"SportsActivityLocation"');
    expect(html).toContain('"addressLocality":"Minglanilla"');
    expect(html).toContain('"streetAddress":"Purok 13 Cadulawan"');
    expect(html).toContain('"postalCode":"6046"');
    expect(html).toContain('"opens":"06:00","closes":"22:00"');
  });

  it("carries the landing title, description and canonical (AC-20)", () => {
    expect(metadata.title).toEqual({
      absolute: "Ella's Pickle Court · Pickleball courts in Minglanilla, Cebu",
    });
    expect(metadata.description).toMatch(/\.$/);
    expect(metadata.alternates).toEqual({ canonical: "/" });
    expect(metadata.robots).toBeUndefined();
  });
});

describe("the day strip, the tiles and the offers", () => {
  /** Every radio in the day strip, as the aria-labels a screen reader hears. */
  const stripDays = (html: string) =>
    [...html.matchAll(/<input[^>]*name="landing-day"[^>]*>/g)].map(
      ([input]) => /aria-label="([^"]*)"/.exec(input)?.[1],
    );

  it("lists seven native radio days from the venue's today, the first called Today (AC-6, AC-25)", async () => {
    const days = stripDays(await render());
    expect(days).toEqual([
      "Today, Sat 26 Sep",
      "Sun 27 Sep",
      "Mon 28 Sep",
      "Tue 29 Sep",
      "Wed 30 Sep",
      "Thu 1 Oct",
      "Fri 2 Oct",
    ]);
  });

  it("shortens the strip to the horizon plus today when the horizon is under a week (AC-6)", async () => {
    getSchedule.mockResolvedValueOnce({ ok: true, data: scheduleFixture({ horizonDays: 2 }) });
    expect(stripDays(await render())).toEqual(["Today, Sat 26 Sep", "Sun 27 Sep", "Mon 28 Sep"]);
  });

  it("names a closed weekday as closed in the strip (AC-6)", async () => {
    const days = WEEK.map((d) => (d.dayOfWeek === 1 ? { ...d, open: null, close: null } : d));
    getSchedule.mockResolvedValueOnce({ ok: true, data: scheduleFixture({ days }) });
    expect(stripDays(await render())).toContain("Mon 28 Sep. Closed");
  });

  it("lists the five tile views in the legend (AC-4)", async () => {
    const html = await render();
    const booking = html.slice(html.indexOf("book-title"), html.indexOf("visit-title"));
    const items = [...booking.matchAll(/>(Free|Selected|Booked|Closed|Past)<\/li>/g)].map(
      ([, view]) => view,
    );
    expect(items).toEqual(["Free", "Selected", "Booked", "Closed", "Past"]);
  });

  it("starts with Request booking disabled, since nothing is picked (AC-13)", async () => {
    const html = await render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Request booking/);
  });

  it("prices every spot from hourly_rate on the read, not a constant (spec 0015, AC-17)", async () => {
    getSchedule.mockResolvedValue({ ok: true, data: { ...scheduleFixture(), hourlyRate: 300 } });
    const html = await render();
    expect(html).toContain("₱300");
    expect(html).not.toContain("₱250");
    const offers = html.slice(html.indexOf("offers-title"), html.indexOf("book-title"));
    expect(offers).toContain("at ₱300 an hour");
    expect(html).toContain("₱300 per court hour.");
  });

  it("renders court rental at ₱250 beside the four amenities, and no open play (AC-17)", async () => {
    const html = await render();
    const offers = html.slice(html.indexOf("offers-title"), html.indexOf("book-title"));
    expect(offers).toContain("Court rental");
    expect(offers).toContain("₱250");
    expect(offers).not.toContain("Most popular");
    expect(html).not.toMatch(/open play/i);

    const amenities = offers.slice(offers.indexOf('aria-label="Amenities"'));
    const names = [...amenities.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map(([, name]) => name);
    expect(names).toEqual(["Guest wifi", "Parking", "Comfort rooms", "Outdoor courts"]);
    expect(offers.match(/>Free<\/span>/g)).toHaveLength(2);
    expect(offers.match(/>Night play<\/span>/g)).toHaveLength(1);
  });

  it("reads each badge right after its tile's name, with no screen reader only wiring (AC-27)", async () => {
    const html = await render();
    const offers = html.slice(html.indexOf("offers-title"), html.indexOf("book-title"));
    expect(offers).toMatch(/>Guest wifi<\/h3><span[^>]*>Free<\/span>/);
    expect(offers).toMatch(/>Parking<\/h3><span[^>]*>Free<\/span>/);
    expect(offers).toMatch(/>Comfort rooms<\/h3><p/);
    expect(offers).toMatch(/>Outdoor courts<\/h3><span[^>]*>Night play<\/span>/);
    expect(offers).not.toContain("sr-only");
    expect(offers).not.toMatch(/hover:/);
  });

  it("says the parking is free on Visit (AC-19)", async () => {
    const html = await render();
    const visit = html.slice(html.indexOf("visit-title"));
    expect(visit).toContain("Free parking on site.");
  });
});

describe("/ when the read fails", () => {
  beforeEach(() => {
    getSchedule.mockResolvedValue({ ok: false, error: { kind: "failed", message: "boom 42P01" } });
  });

  it("renders at once with the skeleton, no hero board and no stats (AC-8, AC-16)", async () => {
    const html = await render();
    expect(html).toContain('aria-label="Loading court hours"');
    expect(html).not.toContain("As of");
    expect(html).not.toContain("Earliest serve");
    // Spec 0015, AC-17: the price is the read's too, so with no read it is
    // left out rather than guessed, everywhere it would show.
    expect(html).not.toContain("Per court hour");
    expect(html).not.toMatch(/₱[1-9]/);
    expect(html).toContain("Message us for today&#x27;s hours");
    expect(html).not.toContain("application/ld+json");
  });

  it("shows no error words and logs one landing line (AC-10, AC-23)", async () => {
    const html = await render();
    expect(html).not.toMatch(ERROR_WORDS);
    expect(html).not.toContain("boom");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/^landing:/);
  });
});

describe("/ over the public read limit", () => {
  beforeEach(() => {
    requestHeaders.value = new Headers({ "x-public-read-limited": "1" });
  });

  it("skips the read, shows the message card and no hero board (AC-9, AC-11)", async () => {
    const html = await render();
    expect(getSchedule).not.toHaveBeenCalled();
    expect(html).toContain("Book by message");
    expect(html).toContain('href="/schedule"');
    expect(html).not.toContain("As of");
    expect(html).not.toMatch(ERROR_WORDS);
  });

  it("offers Messenger, Text us and Try again on the message card, and nothing else (AC-9, AC-13)", async () => {
    const html = await render();
    const card = html.slice(html.indexOf("Book by message"));
    expect(card).toContain(`href="${VENUE_MESSENGER_URL}"`);
    expect(card).toMatch(/href="sms:[^"]*"/);
    expect(card).toContain("Try again");
    expect(card).not.toMatch(/href="(tel|mailto):/);
  });

  it("writes one warning and nothing else (AC-23)", async () => {
    await render();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("privacy (AC-24)", () => {
  it("carries no private reservation field, even when the read had bookings", async () => {
    const data = scheduleFixture({
      blocks: [
        {
          courtId: 1,
          startsAt: manila("2026-09-26", "17:00"),
          endsAt: manila("2026-09-26", "18:00"),
          kind: "booking",
        },
      ],
    });
    getSchedule.mockResolvedValue({ ok: true, data });
    const html = await render();
    expect(html).toContain('aria-label="Court 1 at 5pm. Booked."');
    expect(html).not.toMatch(/customer|phone"|customerName|customer_name|note"|payment|amount/i);
  });
});
