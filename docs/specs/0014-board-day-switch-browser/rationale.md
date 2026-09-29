# 0014. Board day switch read in the browser: rationale

## Context

Both boards change day through `DayNav`, which calls `router.push(?date=…)` inside a transition (spec 0003, "Day switch loading"). That is a full server render of the page: the settings read, the grid read, the metadata, the staff session check, all streamed back as a React Server Component payload, for what is really one day of cells. The landing page (spec 0013) reads another day with a single `GET /api/schedule?date=` from the browser, keeps the old day dimmed meanwhile, lets only the newest answer land, and retries quietly. The engineer prefers how that feels and wants it on every board.

Each board's provider is keyed on `grid.date` today, so a day change remounts it. That remount is what currently resets per day state: the staff selection, pending and failed cells, an open sheet, the changed cell highlight baseline, the one shot scroll to the now marker, and the one `board_day_viewed` event per day (spec 0009, AC-2). A browser read does not remount anything, so each of those has to be reset on purpose.

The board also promises that a day is a link you can share (spec 0006 user story, AC-2, AC-11). The engineer chose that the URL should not create history steps, like the landing page, and then that it should still quietly follow the day on screen, so a dated link opened and then moved away from does not leave a stale address that reloads or shares the wrong day.

## Options considered

### Option 1: Keep the router, make the server render cheaper

Keep `router.push` and shave the server render (skip the metadata read on a same route change, stream the grid).

**Pros**:

- No change to how the day travels; history steps stay.

**Cons**:

- It is still a full RSC round trip per tap, with the session check and page render on the staff board. The engineer asked for the landing page's feel, which this does not give.
- No quiet retries: a failed transition is a failed navigation.

### Option 2: Read the day through the board's own transport, URL replaced quietly

The listener hook, which already reads a day through a transport and guards the newest read, gains a day change. `DayNav` becomes controlled by the board. The URL is updated with `history.replaceState` once a day lands.

**Pros**:

- One small request per tap on the public board and one Server Action on the staff board; the channel stays joined.
- Reuses the transport, the generation guard and the read gate that already exist on both boards (spec 0006, AC-13).
- The same retry helper as the landing page.

**Cons**:

- Per day state that a remount used to reset has to be reset by hand (AC-7).
- Back no longer steps through days.

### Option 3: A separate client fetcher per board, like the landing page

Copy the landing page's `readDay` and status machine into each board, beside the listener hook.

**Pros**:

- Closest copy of the landing page's code.

**Cons**:

- Two readers of the same day on one board (the landing style fetcher and the live hook), which is exactly how a stale answer overwrites a fresh one. AC-8 would need coordination across two hooks.
- The staff board cannot use `GET /api/schedule`: it needs customer details, which only its Server Action returns.

## Rationale

The listener hook already does the hard part of a browser read: a transport per board, a generation counter so only the newest answer lands, and a gate that knows about `429` waits. A day change is one more kind of read through that same machinery, so putting it there (Option 2) keeps one reader per board and makes AC-8 a rule inside one hook rather than a truce between two. Option 3 would have mirrored the landing page's code most literally, but the landing page has no live channel; a board does, and two independent readers of the same day is the classic stale overwrite.

The staff board settles the transport question: it must read through its Server Action to get customer details, so the landing page's `GET /api/schedule` cannot be the one path. Each board's existing transport can.

Three retries at 1, 2 and 4 seconds is the board's version of the landing page's quiet retries. The landing page can wait half a minute because its fallback is a card; a board held dimmed that long is broken to the person using it. Seven seconds covers a dropped request or a cold function, and then the person gets their grid back plus a button.
