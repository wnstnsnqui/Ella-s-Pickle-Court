# 0006. Public schedule board: rationale

The decision record for [index.md](index.md). `/develop` reads the index; this file is why.

## Context

The scope's opening line is the whole point of the product: "see which courts are free before you drive over". Everything built so far serves that line from behind: the data model (spec 0002) grants an anonymous reader exactly four columns of a reservation and broadcasts a narrowed payload on every change; the design system (spec 0003) shipped the grid, the legend, the day navigation, the live indicator and the social card, and left `app/page.tsx` as a holding page that names feature 7 as its replacement; the staff board (spec 0005) proved the live path end to end and asked that the public board share its listener rather than write a second one. What is missing is the page itself and the three things a public page needs that a staff page does not: it must cost nothing to open (no sign in), it must be safe to hand to anyone (nothing personal, and one bad visitor cannot take it down), and it must be findable and shareable (a title, a description, a card).

The forces are small and specific. This is a single venue with a handful of courts and a few dozen players at most, hosted on one container (spec 0001) with Supabase on the free tier, so the constraint that bites is quota and connection count, not throughput. The project rule that every Server Action starts with `requireStaff()` means the public board cannot re read the day the way the staff board does; it needs its own read path, and that path is a public endpoint, which spec 0002's follow up already says must be rate limited before the link is shared. The hosting provider is still not chosen, so anything that assumes a particular reverse proxy is an assumption, not a fact. And the two boards render the same grid, so a change to one is a change to the other unless the shared parts are truly shared.

Not deciding leaves the front door as a paragraph saying the board is not open yet, which is the one page a player would ever visit. Deciding badly leaves a public endpoint with no cap on the venue's free quota, or a second copy of the channel logic that drifts from the first.

## Options considered

### Option 1: The page re renders itself with `router.refresh()`

The board is a server rendered page, and the browser's listener calls Next.js `router.refresh()` on every broadcast so the Server Component runs again with fresh data. No new endpoint, no JSON, no transport code.

**Pros**

- The fewest new files: a page and a small client component that subscribes and refreshes.
- One read path (`getSchedule()` in the page) to keep honest.

**Cons**

- A refresh re renders the whole tree, including the Clerk aware header and the streamed staff menu, on every broadcast in every open tab; that is the most expensive way to fetch a few hundred bytes of grid.
- The listener cannot see the outcome: a refused read, a `429`, or a timeout looks the same as success, so the live indicator cannot tell the truth and backoff cannot work.
- The day navigation state, the scroll position and any highlight are reset by the refresh, which fights the "opens at the current hour" requirement directly.

### Option 2: A server rendered page, a public JSON endpoint for re reads, one shared listener hook, and an in memory limiter in `proxy.ts` (chosen)

The page renders `getSchedule()` per request. The browser listens on the anonymous client and re reads the day from `GET /api/schedule`, through a base hook extracted from the staff listener, with broadcast bursts coalesced and a slow poll while the channel is down. `proxy.ts` caps the page and the endpoint at 60 requests a minute per forwarded address, from an in memory sliding window, before Clerk runs.

**Pros**

- The public read stays a `GET` with a path, so it can be rate limited by path, cached with `no-store`, and tested with curl; the Server Action rule stays intact.
- The hook sees every outcome and can show not live, back off on a `429`, and fold broadcasts into one read.
- The channel logic lives once, which is what spec 0005 asked for, and the burst coalescing benefits the staff board the day it adopts it.
- The limiter is code in the repo with unit tests and works on any Docker host, chosen or not.

**Cons**

- One more endpoint and one more transport to keep in step with `getSchedule()`.
- An in memory store resets on deploy and is per container; correct for one container, wrong the day there are two.
- The limiter depends on a forwarded address header the host must set; until the host is chosen, direct traffic is not limited.
- Moving the staff hook onto a base touches a feature that is done.

### Option 3: A browser only board reading Supabase directly with the anon key

The page ships a shell and the browser reads `court`, `venue_settings` and `reservation` itself through the Supabase client, subscribes to the channel, and builds the grid client side. The server never reads the database for the public page.

**Pros**

- No server read path and no JSON endpoint; the browser talks to Supabase and the app server only serves static shells.
- The anon key is public anyway, so nothing new is exposed.

**Cons**

- Nothing to rate limit in this app at all: every read goes straight to Supabase, so the venue's quota is guarded only by Supabase's project limits.
- The first paint is a skeleton, then a fetch, then a grid; the "opens at the current hour" and the shareable, indexable page both suffer, and the JSON-LD hours would have to be fetched before they can be rendered.
- The grid derivation (`buildGrid`, the `Asia/Manila` day bounds) would run in the browser against the device clock, which is exactly the "whose clock" problem the design settled the other way.

### Option 4: Rate limit at the host's reverse proxy, not in the app

Any of the above, with the limiter left to Caddy, Traefik or the deploy panel's edge instead of `proxy.ts`.

**Pros**

- Zero app code, and the edge sees the true client address without header trust questions.
- Can also cover the websocket upgrade and static files, which `proxy.ts` never sees.

**Cons**

- The host is not chosen, so the limit would not exist until it is, and spec 0002's follow up says it must exist before the link is shared.
- Configuration outside the repo, with no unit test, that a future host change silently loses.

## Rationale

Option 2 is the one that answers all three public page needs without adding a vendor or a moving part the team would have to operate. The decisive force is the Server Action rule: with every action starting at `requireStaff()`, the public board needs a read path of its own, and a `GET` Route Handler is the plainest thing that is: it has a path to limit, a status code the hook can act on, and the same `ActionResult` shape the staff transport already returns, so the base hook does not care which transport it is holding. Option 1 is tempting for its size, but it makes the listener blind, and a live indicator that cannot see a failed read is worse than none. Option 3 gives up the thing that makes this page cheap to open and safe to hand out: a first paint that already contains the grid, and a server in front of the database where a cap can live.

The limiter lives in `proxy.ts` because that is the only place that exists today. The host is a follow up on spec 0001; a limit that waits for it would not be there when the link is first shared, which is exactly the moment it is needed. In memory is correct for a single container, and the window is generous (a real player on a live board makes a few reads a minute, a scraper in a loop makes hundreds), so a false refusal is unlikely and a true one costs nothing but a short wait. The honest limit of this approach is stated in the spec: the anon key is public, so a determined client can go around the app to Supabase directly, and there the column grant (nothing personal) and the project quota (feature 11 watches it) are the defence, as they already are for the staff board.

Extracting the base hook now rather than later is the one place this spec reaches into shipped code. The alternative is two copies of channel, generation and coalescing logic that will drift, which is the failure spec 0005 wrote its follow up to avoid. The staff hook's tests already pin its behaviour, so the extraction is a move with a safety net, and it is smaller now than after a third consumer exists.

The remaining calls (a `now` stamp from the server, past as a row property, past dates refused only in the public read, a route level loading file, plain text for a `429`) each pick the version that keeps a fact in one place: time comes from the server, cell states stay three, the horizon rule stays in `resolveDate`, and a refused request renders no React.
