# Booking receipt

## Overview

One receipt for every place a player sees it (spec 0017): the last step of checkout
on `/`, the lookup on `/booking`, the printed page, and the saved image. All four read
the same `ReceiptView`, so they can never disagree. The lookup page lives at
`app/booking/page.tsx` and holds no booking itself; the result arrives through the
`lookupBooking` Server Action in `lib/booking/actions.ts`.

## Key files

| File                  | Owns                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `receipt-view.ts`     | `buildReceiptView()`: pure, turns a checkout receipt or a lookup answer into the `ReceiptView` every surface reads. Tested without a browser. |
| `receipt-card.tsx`    | `ReceiptCard`, `SaveButtons` (Save as PDF through `window.print()`, Save as image) and `TrackLink`. Marks the card `data-receipt`. |
| `receipt-image.ts`    | `receiptImageModel()` and the canvas drawing behind Save as image. Prints only what the screen shows, in the same order.     |
| `booking-lookup.tsx`  | The `/booking` form and its answers: found, not found, ended, limited, failed, with Check again.                              |

The words for each answer live in `lib/booking/lookup.ts`; the print stylesheet lives
in `app/globals.css` under `@media print`.

## Conventions

- **Add a new receipt fact to `ReceiptView` first**, then read it from the card and the image model. Never compute a value inside one surface only.
- **The checkout shows contact in full; the lookup masks it.** `ReceiptView.source` decides, and the masking happens in Postgres before the answer arrives.
- **The code never sits in a URL query, `localStorage`, a log line or an event.** "Track this booking" hands it to `/booking` in the fragment, which no request carries to a server; the page reads it once and clears it.
- **On paper only the `data-receipt` card prints.** Anything inside the card that should not print takes `data-print-hide`. `print-styles.test.ts` reads the compiled CSS, so change the print rules in `app/globals.css` with it.
- `/booking` is `noindex` and kept out of the sitemap, but never disallowed in `robots.txt`, so a crawler can read the noindex.

## Related specs

- [0017 Booking receipt and lookup](../../docs/specs/0017-booking-receipt-lookup/index.md)
- [0015 Online booking checkout](../../docs/specs/0015-online-booking-checkout/index.md), the checkout's receipt (AC-14)

_Drafted by /sync from the introducing change, worth a quick human pass._
