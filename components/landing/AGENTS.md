# Landing page

## Overview

The venue's front door at `/` (spec 0013): top bar, hero with a live mini board,
offers, the court booking section, Visit, and the footer. The route lives in
`app/(landing)/`; everything it renders lives here. The public board itself moved
to `/schedule`.

## Key files

| File                                    | Owns                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `app/(landing)/page.tsx`                | The one server read of today (`getSchedule()`, anon), shared by every live section. Renders per request. |
| `booking-picker.tsx`                    | The day strip, the hours table, picks and the total. Reads other days in the browser from `GET /api/schedule`. |
| `booking.ts`                            | Pure booking rules: `tileView()`, `groupPicks()`, `bookingTotal()`, `smsBody()`.                        |
| `read-day.ts`                           | The browser read with quiet retries at 1, 2, 4, 8 and 16 seconds, built on `lib/schedule/quiet-retry.ts`. A `429` stops at once. |
| `hero-data.ts`                          | Pure: turns a grid into the hero's rows, caption and chip (today, or tomorrow when today is done).     |
| `content.ts`                            | Every word the page prints that is not a venue fact. Venue facts stay in `lib/venue.ts`.               |
| `notices.ts`                            | The two toasts: the read failed toast and the "online booking is coming soon" toast.                  |
| `channels.tsx`                          | Messenger and Text us, the only two ways to book the page offers.                                       |
| `press.ts`                              | `PRESS`, the tap feedback class every landing button wears.                                             |
| `section-link.tsx`                      | `SectionLink`, the `Link` for `#offers`, `#book` and `#visit` that scrolls on every click, not only the first. |
| `checkout-sheet.tsx`                    | The checkout card (spec 0015): a centered Radix dialog over `--overlay-soft`, the steps, the hold, Confirm and release. Mounted fresh per Book press. |
| `checkout-payment.tsx`, `checkout-receipt.tsx`, `checkout-selection.tsx` | The Payment step (with Save QR code, which saves `PAYMENT_QR_SRC` byte for byte under its own extension), the screenshot upload hook and the hold banner; Review and the receipt (drawn by `components/receipt/`); the Selected courts and slots card and the summary line. |
| `turnstile-widget.tsx`                  | The Turnstile widget on the Terms step, retried once quietly before checkout gives up on this device. |
| `test-fixture.ts`                       | `scheduleFixture()`, a real `Schedule` built through `buildGrid`, for the tests.                       |

## Conventions

- **The page never shows an error.** A failed or rate limited read leaves a live section out or hands it to the browser to retry quietly; the only failure a visitor reads is the toast and the "message us to book" card. Log with `console.warn`/`console.error` and report through `captureBrowserException()`, never render error wording.
- **Today is read once on the server; any other day is read in the browser.** The URL stays `/`. Only the newest read may land (the `latest` ref in `booking-picker.tsx`).
- **The clock is the server's.** Past tiles use `schedule.now` plus the minutes this tab has held it, never `Date.now()` on its own, so a device with a wrong clock cannot move them.
- **Over the shared rate limit, `/` is never a `429`.** `proxy.ts` passes the request with `PUBLIC_READ_LIMITED_HEADER` set, and the page skips the read and shows the message card.
- **"Request booking" books nothing.** It shows the coming soon toast and sends `booking_intent` (counts only) through `captureBookingIntent()`. It shows only while checkout is off (`checkoutEnabled()`, decided per request on the server); with checkout on the button reads "Book" and opens the checkout card, still sending `booking_intent`.
- **However the checkout card closes, focus goes to the "Your booking" heading,** never the page body. The card dims with `--overlay-soft`, not `--overlay`, on purpose.
- **The day strip changes with the screen.** From `lg` up it pages a week at a time with arrows; below `lg` it is one row that scrolls sideways through every bookable day. Both are rendered, CSS shows one, and each keeps its own radio group name.
- **A link to a section of this page is a `SectionLink`, never a bare `Link`.** Next scrolls to a fragment only when the hash changes, so once the address ends in `#book` a plain `Link` to `/#book` stops responding. `SectionLink` scrolls that case itself and leaves every other click to `Link`.
- **Sections open with `SectionHeading` and reveal on scroll through `data-reveal`** (the keyframes live in `app/globals.css`, and reduced motion arrives already in place).

## Related specs

- [0013 Landing page](../../docs/specs/0013-landing-page/index.md)
- [0015 Online booking checkout](../../docs/specs/0015-online-booking-checkout/index.md) (the checkout card)
- [0014 Board day switch in the browser](../../docs/specs/0014-board-day-switch-browser/index.md) (the shared quiet retry)

_Drafted by /sync from the introducing change, worth a quick human pass._
