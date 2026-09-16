# 0010. Privacy notice, terms of use, and the phone retention purge

**Date**: 2026-09-16
**Status**: In Progress

## Summary

The app gets two public pages, `/privacy` and `/terms`, linked from the footer of every page, and a promise on the privacy page that it can keep: a customer's phone number is cleared automatically 90 days after the booking it belongs to ends. A nightly job inside Postgres (`pg_cron`, a scheduler that lives in the database) does the clearing and also redacts the number from the audit trail. There is no cookie banner, because the public board stores nothing on a player's device, so the notice is the disclosure. Staff, who are identified to Clerk and PostHog by name, acknowledge the notice once in a dialog on their first visit to `/staff`, and again whenever the notice changes.

See [rationale.md](rationale.md) for the context, the options considered, and why Option 1 was chosen. See [verify.md](verify.md) for the checklist derived from the acceptance criteria below.

## Requirements

**User stories**:

- As a player, I want to see in plain words what the site records about me when I look at the board, so that I know I am not being tracked.
- As a customer who booked a court, I want to know who holds my name and number, how long they keep it, and how to ask them to change or remove it.
- As a staff member, I want to be told what the tools I sign into record about me, once, without it getting in the way of the desk.
- As Ella, I want the privacy page to be true without anyone remembering to do anything, so that a customer asking about their number gets an answer I can stand behind.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: `GET /privacy` renders for anyone, signed in or not, inside the shared app shell, with its own `metadata` title and description and no `noindex`. It states, in this order: who holds the data (the venue's legal name, contact email and address from `lib/legal/constants.ts`); what is collected about customers (name, phone, an optional note, payment status and amount, given to staff at the desk or by phone) and why; what is recorded about visitors to the public board (anonymous, cookieless page views through PostHog, nothing stored on the device, no cookie); what is recorded about staff (name and email held by Clerk, sign in cookies on the staff pages, Clerk id, name and role sent to PostHog and kept in the browser's local storage on staff pages only); where the data lives (the database in Singapore with Supabase, Clerk and PostHog in the United States); that no customer name, phone, note or amount is ever sent to PostHog or shown on the public board; how long the phone number is kept (`PHONE_RETENTION_DAYS` days after the booking's scheduled end, then cleared automatically, including from the change history) and that the rest of the booking is kept for the venue's own usage records; how to ask to see, correct or delete booking details (the contact email, or the front desk in person) and that a request is answered within 30 days; the notice version, shown as a "Last updated" date.
- **AC-2**: `GET /terms` renders the same way. It states: what the board is (a live view of court availability at the moment of viewing, with no guarantee that a court shown Available is still free on arrival); that the site takes no bookings and no payments; that staff accounts are for the venue's authorised staff only; acceptable use (a person may read the board, and automated reading is rate limited and may be refused); that the venue may change the terms and the page's date shows when; governing law of the Philippines; the same contact email.
- **AC-3**: The footer in `components/app-shell.tsx` carries `Privacy` and `Terms` links on every page that uses the shell (the public board, the staff board, settings, reports, the sign in pages, and the two new pages themselves). The links meet the existing contrast and focus rules from spec 0003.
- **AC-4**: `lib/legal/constants.ts` is the single source for `VENUE_LEGAL_NAME`, `PRIVACY_CONTACT_EMAIL`, `VENUE_ADDRESS`, `PHONE_RETENTION_DAYS` (`90`), and `PRIVACY_NOTICE_VERSION` (an ISO date string, `2026-09-16` at creation). The pages, the staff dialog, and the tests read from it and nowhere else. Placeholder values are visibly marked (`[Venue legal name]`) so an unfinished page is obviously unfinished rather than silently blank.
- **AC-5**: A Postgres function `public.purge_customer_phones()` sets `customer_phone` to null on every `reservation` row where `kind = 'booking'`, `customer_phone is not null`, and `ends_at < now() - interval '90 days'`, regardless of `status`. Each affected row's `version` increments and `changed_by` becomes null; `updated_at` is stamped by the existing `reservation_set_updated_at` trigger, and the existing audit and broadcast triggers fire as for any change. The update is a data modifying CTE with `returning id`, collected into an array variable, and a second statement in the same function rewrites `customer_phone` to JSON null with `jsonb_set` inside `old_row` and `new_row` of every `reservation_audit` row whose `reservation_id` is in that array, including the row the purge itself just caused (the audit trigger is `after update`, so it has already fired). It returns the count of reservations purged. Running it twice in a row returns zero the second time.
- **AC-6**: `pg_cron` runs `purge_customer_phones()` every day at 19:00 UTC (03:00 in `Asia/Manila`). The function is `security definer`, owned by `postgres`, with `execute` revoked from `public`, `anon` and `authenticated`; a signed in staff member calling it over the API is refused.
- **AC-7**: A database test asserts that the interval inside `purge_customer_phones()` equals `PHONE_RETENTION_DAYS` days, so the page cannot drift from the job. A unit test asserts that the privacy page prints `PHONE_RETENTION_DAYS`.
- **AC-8**: After a purge, a booking still reads as a booking everywhere staff look: the staff board's details sheet shows the name and an empty phone, the usage report's day list is unchanged, and a staff board that held the old `version` refetches on the broadcast as it does for any change. Closures are never touched.
- **AC-9**: One migration adds `privacy_acknowledged_at timestamptz` and `privacy_acknowledged_version text` to `staff` (both nullable), drops and recreates `ensure_staff()` (a widened `returns table` cannot go through `create or replace`) to return `privacy_acknowledged_version` alongside the existing three columns, with every `revoke` and `grant execute` reissued after the drop, and adds `public.acknowledge_privacy_notice(version text)`: `security definer`, `set search_path = ''`, updates only the caller's own row (`clerk_user_id = auth.jwt() ->> 'sub'`) to `now()` and the given version, raises `insufficient_privilege` for a signed out caller, raises `no_data_found` when zero rows were updated (no `staff` row), and returns the updated `privacy_acknowledged_version`. No `update` grant on `staff` is added for `anon` or `authenticated`.
- **AC-10**: On every route under `/staff`, a signed in, active staff member whose `privacy_acknowledged_version` is not equal to `PRIVACY_NOTICE_VERSION` sees a modal dialog rendered by `app/staff/layout.tsx` over the page. The layout (a Server Component) computes one boolean and passes it, with `noticeVersion`, as props to a client component; the dialog's `open` is that prop on every render, with no state of its own, so a `router.refresh()` after acknowledging closes it by re-rendering the layout. On `DialogContent`, `onEscapeKeyDown`, `onPointerDownOutside` and `onInteractOutside` call `preventDefault()` and the close button is not rendered. It shows a heading, five or six plain bullets summarising the notice, a link to `/privacy` that opens in a new tab, and one `Acknowledge` button. Inactive staff and signed out visitors never see it; `proxy.ts` still owns the sign in redirect.
- **AC-11**: `Acknowledge` calls the Server Action `acknowledgePrivacyNotice({ version })` in `lib/legal/actions.ts` with the `noticeVersion` prop it was given (the client never imports `lib/legal/constants.ts`). The action calls `requireStaff()`, validates its input with Zod as `z.object({ version: z.literal(PRIVACY_NOTICE_VERSION) })`, calls `acknowledge_privacy_notice` through `staffSupabase()`, maps a `no_data_found` error to `failed`, and returns `ok` with the stored version. On `ok` the client calls `router.refresh()` and the dialog is gone; on any error the dialog stays, shows an inline message, and the button can be pressed again. A stale client sending an old version (the constant changed under a long lived tab) is refused with `invalid` and told to reload.
- **AC-12**: Changing `PRIVACY_NOTICE_VERSION` and deploying makes every staff member see the dialog once more. A member who has acknowledged the current version never sees it again on that version.
- **AC-13**: After a successful acknowledgement, `captureStaffEvent()` sends `privacy_notice_acknowledged` with `version` as its only property, added to the allow list in `lib/analytics/properties.ts` as a `.strict()` schema, never awaited. `/privacy` and `/terms` load PostHog in cookieless mode like the board, because they are outside `/staff` and `/sign-in`.
- **AC-14**: The dialog is a labelled modal with focus held inside it, operable by keyboard, and the two pages use a heading hierarchy (`h1`, then `h2` per section) that a screen reader can navigate; text and links meet WCAG AA contrast in both themes.
- **AC-15**: `npm run check` and `npm run test:db` are green, and the purge is proven on the real project: a booking seeded with `ends_at` 91 days ago and a phone loses the phone from both tables after a manual `select public.purge_customer_phones()`, and `cron.job` lists the schedule.

## Decision

**Chosen option**: Option 1: Notice pages, a nightly `pg_cron` purge that redacts the audit trail, and a one time staff acknowledgement

Build `/privacy` and `/terms` as TSX pages fed by `lib/legal/constants.ts`, link them from the shell footer, purge `customer_phone` from `reservation` and `reservation_audit` 90 days after a booking's scheduled end with a `pg_cron` job, and gate `/staff` behind a one time versioned acknowledgement dialog. No cookie banner on the public board.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `zod` (`pproenca/dot-skills`, `.agents/skills/zod/`) · `accessibility` (`.agents/skills/accessibility/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `instrument-integration` (`posthog/skills`, `.agents/skills/instrument-integration/`)

The calls made here rather than asked:

- **The 90 day clock runs from `ends_at` only** (the engineer's pick), so a booking cancelled long before its date keeps the number until 90 days after the date it would have happened. The page says "after the booking's scheduled end", which is true either way. The runner up, the earlier of `ends_at` and `cancelled_at`, is one more `least()` in the `where` clause if it ever matters.
- **The acknowledgement goes through a SQL function, not an update policy.** `staff` has no `update` grant for app roles today and every policy in spec 0002 reads it, so widening that surface for two columns is the wrong trade. A `security definer` function that writes only the caller's own row is the pattern `ensure_staff()` already set. Runner up: an update policy with a column level grant, which works but doubles the number of places the `staff` write rules live.
- **The gate is a dialog in the layout, not a redirect.** `proxy.ts` cannot read Supabase, so the check would land in the layout anyway; a dialog keeps the URL and needs no new route. Runner up: `/staff/welcome`, cleaner in the address bar and nothing else.
- **The purge writes an honest audit row.** It is an ordinary update, so the history shows that a system purge happened (`changed_by` null, `op = 'update'`), and the phone inside every audit row for that reservation is then nulled. Runner up: disabling the trigger for the purge, which hides the event and needs rights the migration role should not exercise.
- **Response window for a data subject request: 30 days.** A round number the venue can keep by email or at the desk. Runner up: 15 working days, tighter than a two court venue needs to promise.
- **Prose lives in the pages, facts live in constants.** The wording is written once by `/develop` from the section list in AC-1 and AC-2, flagged for Ella's read before launch. It is a plain language notice tailored to what the app really does, not legal advice, and the spec says so in Follow-up.
- **The `Book` sheet gets no retention hint** (the engineer's pick). The footer link is the notice; a hint under the phone field is a one line addition later if staff ask what to tell customers.

## Feature design

**Data model sketch**:

| Entity | Change | Fields | Notes |
| --- | --- | --- | --- |
| `staff` (existing) | add two columns | `privacy_acknowledged_at timestamptz null`, `privacy_acknowledged_version text null` | Null until first acknowledgement. Written only by `acknowledge_privacy_notice()`. `ensure_staff()` is dropped and recreated to return `display_name, role, is_active, privacy_acknowledged_version`. |
| `reservation` (existing) | no new column | `customer_phone` → null, `version + 1`, `changed_by` → null; `updated_at` stamped by the existing trigger | Only rows with `kind = 'booking'`, a non null phone, and `ends_at < now() - interval '90 days'`. Any `status`. The audit trigger takes its own `changed_by` from `auth.jwt() ->> 'sub'`, which is null under `pg_cron`, so the audit row's null and the reservation's null are independent; the migration says so in a comment so nobody later "fixes" the trigger to read `new.changed_by`. |
| `reservation_audit` (existing) | no new column | `old_row`, `new_row`: `customer_phone` key set to JSON null via `jsonb_set(col, '{customer_phone}', 'null')` | The key has existed since the first migration, so no presence check. For every row whose `reservation_id` is in the purged set, as a second statement after the reservation update so the purge's own audit row is included. |
| `cron.job` (`pg_cron`) | one job | name `purge_customer_phones`, schedule `0 19 * * *`, command `select public.purge_customer_phones()` | `pg_cron` evaluates schedules in UTC on Supabase. Registered idempotently inside a `do` block: `if exists (select 1 from cron.job where jobname = 'purge_customer_phones') then perform cron.unschedule('purge_customer_phones'); end if;` then `perform cron.schedule(...)`. A bare `cron.unschedule` by name throws when the job does not exist. |
| `lib/legal/constants.ts` (code) | new file | `VENUE_LEGAL_NAME`, `PRIVACY_CONTACT_EMAIL`, `VENUE_ADDRESS`, `PHONE_RETENTION_DAYS = 90`, `PRIVACY_NOTICE_VERSION = "2026-09-16"` | The only source the pages, dialog, action schema, and tests read. |

No new relationships. `staff` 1:N `reservation` (`created_by`, `changed_by`) and `reservation_audit` are unchanged; a purged row's `changed_by` null is already allowed by the schema.

**State transitions**:

Staff acknowledgement, per person: `not acknowledged` (both columns null) → `acknowledged <version>` (on `acknowledge_privacy_notice`) → `stale` (the constant changed under them; columns unchanged, the dialog returns) → `acknowledged <new version>`. Only forward; nothing clears the columns.

Phone on a booking: `held` → `cleared` (the purge, 90 days after `ends_at`). A staff member may type a phone into an old booking again through the existing edit action; the next run clears it, so `cleared` is stable within a day.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `/privacy` | GET (page) | none | the notice, `metadata` title and description | public | none |
| `/terms` | GET (page) | none | the terms, `metadata` | public | none |
| `acknowledgePrivacyNotice({ version })` Server Action | POST | `version: z.literal(PRIVACY_NOTICE_VERSION)` (req) | `ActionResult<{ version: string }>` | `requireStaff()`, then the function's own `sub` check | `unauthenticated`, `invalid` (old version, "reload the page"), `failed` (RPC error, including `no_data_found`) |
| `public.acknowledge_privacy_notice(version text)` SQL | RPC | `version` | `privacy_acknowledged_version text` | signed in JWT with `sub`; updates own row only | `insufficient_privilege` when no `sub`; `no_data_found` when zero rows updated (the `staff` row is missing, possible only if it was deleted between the page render that called `ensure_staff()` and this separate POST) |
| `public.purge_customer_phones()` SQL | cron only | none | `integer` purged count | `postgres` only; execute revoked from `public`, `anon`, `authenticated` | none; an empty run returns 0 |
| `public.ensure_staff()` SQL (existing, return widened) | RPC | none | `display_name, role, is_active, privacy_acknowledged_version` | as today | as today |

**Value sourcing**:

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| `/privacy` | controller name, email, address | `VENUE_LEGAL_NAME`, `PRIVACY_CONTACT_EMAIL`, `VENUE_ADDRESS` in `lib/legal/constants.ts` (placeholders until Ella supplies them, Build plan task 9) |
| `/privacy` | retention period in days | `PHONE_RETENTION_DAYS` |
| `/privacy`, `/terms` | "Last updated" date | `PRIVACY_NOTICE_VERSION`, rendered in `Asia/Manila` wording as a plain date |
| `/privacy` | data locations | fixed prose: Supabase Southeast Asia (Singapore), Clerk United States, PostHog United States (spec 0009 chose the US cloud hosts in `lib/analytics/hosts.ts`) |
| `/privacy` | what PostHog records | spec 0009's "What is sent" table, restated in plain words |
| `/privacy` | request response window | 30 days, decided here |
| `/terms` | rate limiting statement | spec 0006's limiter in `proxy.ts` |
| footer links | hrefs | `/privacy`, `/terms` |
| staff layout gate | whether to show the dialog | `staff.kind === "ok" && staff.staff.isActive && staff.staff.privacyAcknowledgedVersion !== PRIVACY_NOTICE_VERSION`; `privacyAcknowledgedVersion` comes from `ensure_staff()`'s new column through `currentStaff()` |
| dialog | summary bullets | written from AC-1's section list; the link target is `/privacy` |
| staff layout gate | `open` and `noticeVersion` props | computed in the Server Component layout from the condition above and `PRIVACY_NOTICE_VERSION`; the client dialog holds no state of its own |
| `acknowledgePrivacyNotice` | the version to store | the `noticeVersion` prop the client was rendered with; the action validates it equals the server's constant |
| `acknowledge_privacy_notice` | which row | `auth.jwt() ->> 'sub'` |
| `acknowledge_privacy_notice` | timestamp | `now()` |
| `privacy_notice_acknowledged` event | `version`, distinct id | the stored version; Clerk user id via `captureStaffEvent()` as in spec 0009 |
| `purge_customer_phones` | which reservations | `kind = 'booking' and customer_phone is not null and ends_at < now() - interval '90 days'` |
| `purge_customer_phones` | new `version` | `version + 1` |
| `purge_customer_phones` | `changed_by` | null (no person acted) |
| `purge_customer_phones` | which audit rows | `reservation_id = any(purged ids)` |
| `cron.job` | schedule | `0 19 * * *` UTC, from 03:00 `Asia/Manila` |
| test (AC-7) | the function's interval | read from `pg_get_functiondef('public.purge_customer_phones'::regproc)` and compared to `PHONE_RETENTION_DAYS` |

**Key invariants**:

- No `reservation` row with `kind = 'booking'` and `ends_at` older than 90 days plus one nightly run holds a phone number, in the row or in any of its audit rows.
- The purge never changes `customer_name`, `note`, `payment_status`, `amount`, `status`, or any closure.
- A purged reservation's `version` increments exactly once per purge, so the optimistic concurrency rule from spec 0002 holds and open boards refetch.
- `staff.privacy_acknowledged_at` and `privacy_acknowledged_version` are either both null or both set, and only the row's own user can set them.
- `PHONE_RETENTION_DAYS` in code equals the interval in the SQL function (AC-7 test).
- The `staff` table keeps no `update` grant for `anon` or `authenticated`.

**Security model**:

- Compliance scope: Philippine Data Privacy Act of 2012 (RA 10173). The venue is the personal information controller; Supabase, Clerk and PostHog are processors. The audit trail already exists (spec 0002) and is not negotiable; this feature redacts one field inside it, never deletes rows.
- `/privacy` and `/terms`: public, read only, no data read; served through the existing rate limiter like any public route.
- `acknowledge_privacy_notice()`: `security definer`, `set search_path = ''`, keyed on `auth.jwt() ->> 'sub'`, so a caller can only mark their own row. Postgres is the enforcement point; `requireStaff()` in the action is the friendly error.
- `purge_customer_phones()`: `security definer`, owner `postgres`, execute revoked from `public`, `anon`, `authenticated`. Not reachable over the API. `pg_cron` runs it as `postgres`.
- The service role key is not involved anywhere; the migration is applied by the CLI as today.
- Analytics: the new event carries a version string only. No customer field can pass the allow list.
- The dialog is a notice gate for the UI, not authorization. A staff member who has not acknowledged can still, in principle, call a Server Action by hand; the row level policies decide writes exactly as before. This is deliberate: acknowledgement is a record, not a permission.

**Configuration required**:

- No new environment variables. One project side step: `pg_cron` must be enabled on the Supabase project (the migration's `create extension if not exists pg_cron` does this when applied as `postgres`; verify under the dashboard's Integrations that Cron shows the job).

**Critical test scenarios**:

- Happy path, purge: seed a booking with a phone and `ends_at` 91 days ago plus one with `ends_at` 30 days ago and one closure; `select public.purge_customer_phones()` returns 1; the old booking's phone is null in `reservation` and in every `reservation_audit` row for it including the newest; the other two rows are untouched; a second call returns 0, verifies **AC-5**, **AC-8**.
- Happy path, pages: `/privacy` and `/terms` render signed out with their metadata, print `PHONE_RETENTION_DAYS` and the constants, and the footer on `/` carries both links, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
- Happy path, acknowledgement: a fresh staff account opens `/staff`, sees the dialog, taps Acknowledge, the dialog goes and `staff` holds `now()` and the version; a reload shows no dialog; `privacy_notice_acknowledged` appears in PostHog with the version, verifies **AC-9**, **AC-10**, **AC-11**, **AC-13**.
- Failure case: the action receives an old version string and returns `invalid` with a reload message, the dialog stays; the RPC fails (abort or Postgres error) and the dialog shows the inline error and keeps the button live, verifies **AC-11**.
- Version bump: change `PRIVACY_NOTICE_VERSION` in a test, render the layout for an acknowledged member, the dialog is back, verifies **AC-12**.
- Auth/permission: `authenticated` calling `purge_customer_phones` over RPC gets `42501` permission denied; a signed out call to `acknowledge_privacy_notice` raises `insufficient_privilege`; a signed in call cannot name another row, verifies **AC-6**, **AC-9**.
- Drift guard: the database test reads the function definition and asserts `interval '90 days'` matches `PHONE_RETENTION_DAYS`, verifies **AC-7**.
- Accessibility: the dialog traps focus, Escape does nothing, the pages pass the heading and contrast checks used for spec 0003, verifies **AC-14**.

## Build plan

Tracer Bullet: the first task runs one thin thread through every layer of the harder half (a migration, a SQL function, a job, and a proof on the real project), because that is where a wrong assumption about `pg_cron` or the audit JSON would cost the most. The pages and the gate thicken it afterwards.

1. [x] One migration, `privacy_terms_retention`, in this order: `create extension if not exists pg_cron`; `purge_customer_phones()` (the CTE with `returning id` into an array, then the audit redaction, the comment about the trigger's `changed_by`), with execute revoked from `public`, `anon`, `authenticated`; the `do` block that unschedules the job only if it exists, then schedules it; the two `staff` columns; `drop function public.ensure_staff()` then `create function` with the wider return type, followed by the same `revoke`/`grant execute` lines the sign in migration used; `acknowledge_privacy_notice()` with its grants. Applied with `npx supabase db push`, `db advisors --linked` clean, types regenerated, and one staff sign in checked before moving on, satisfies **AC-5**, **AC-6**, **AC-9**.
2. [ ] The thin proof on the real project: seed the 91 day old booking, run the function by hand, check both tables, check `cron.job` lists the schedule, then let one night pass and read `cron.job_run_details`, satisfies **AC-5**, **AC-6**, **AC-8**, **AC-15**.
3. [x] The database tests in `supabase/tests/`: the purge scenarios, the second run returning 0, the permission refusals for both functions, the self only write, and the interval drift guard, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-9**.
4. [x] `lib/legal/constants.ts` with placeholders, `lib/staff.ts` adding `privacyAcknowledgedVersion: string | null` to `Staff` and reading it from the widened `ensure_staff()` row in `currentStaff()` (its only caller), and `lib/legal/actions.ts` with `acknowledgePrivacyNotice()` (`requireStaff`, Zod literal, RPC, `captureStaffEvent` after `ok`), plus the `privacy_notice_acknowledged` schema in `lib/analytics/properties.ts`, with unit tests for the action's three outcomes and the event, satisfies **AC-4**, **AC-11**, **AC-13**.
5. [x] The gate: `components/staff/privacy-notice-dialog.tsx`, a client component on the existing `Dialog` primitive taking `open` and `noticeVersion` props, dismissal prevented and no close button, rendered by `app/staff/layout.tsx` under the condition in Value sourcing; keyboard and focus checked; a layout test for the four states (signed out, inactive, unacknowledged, acknowledged) and the version bump, satisfies **AC-10**, **AC-12**, **AC-14**.
6. [x] `app/privacy/page.tsx` and `app/terms/page.tsx` on a small `components/legal-page.tsx` wrapper (type scale from `docs/design.md`), with `metadata`, the sections in AC-1 and AC-2 order, every fact read from the constants, and page tests for the metadata and the printed retention days, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-7**.
7. [x] The footer links in `components/app-shell.tsx` with the shell test extended, satisfies **AC-3**.
8. [ ] The staff dialog's bullets and link wired to the finished page, the live acknowledgement proven with a fresh staff account and seen in PostHog, satisfies **AC-10**, **AC-11**, **AC-13**.
9. [ ] Ella supplies the legal name, contact email, and address; the constants replace the placeholders; Ella reads both pages once; `npm run check` and `npm run test:db` green, satisfies **AC-4**, **AC-15**.

## Consequences

**Positive**:

- The privacy page's retention line is enforced by the database, nightly, without a person or the app container.
- Customer phone numbers stop accumulating; after 90 days the audit trail holds none either.
- The first scheduled job sets the pattern spec 0001 asked for: `pg_cron` inside Postgres, no worker.
- Every staff member has a dated, versioned record of having seen the notice.
- Spec 0002's open retention item and spec 0009's two notice items are closed.

**Negative / tradeoffs**:

- `pg_cron` failures are silent from the app's point of view. Until uptime monitoring exists (deferred under spec 0009), the only evidence is `cron.job_run_details` in the dashboard. A monthly glance is the operating cost.
- A cancelled far future booking keeps its phone until 90 days after its scheduled end, longer than strictly needed.
- Dropping and recreating `ensure_staff()` touches the sign in path. A missed grant breaks every staff page at once; task 1 must restate the grants and task 2 must sign in before moving on.
- One more dialog on first staff visit, and again on every notice change. Kept to a thirty second read on purpose.
- The notice text is plain language drafted by the build, not legal advice. Ella, or a lawyer if she wants one, reads it before the link goes out.

**Neutral**:

- The purge bumps `version` on old rows, so an owner editing a 91 day old booking at 03:00 could hit the stale version path once. The existing refetch handles it.
- `Staff` type in `lib/staff.ts` gains one field; every consumer that builds a `Staff` in tests updates.
- `/privacy` and `/terms` are the first pages that may be statically rendered; the "renders per request" rule applies to boards, not to these.
- No Agent Skills or MCP servers were searched: no new tool was chosen, `pg_cron` ships with Supabase.

## Follow-up

- [ ] Ella supplies `VENUE_LEGAL_NAME`, `PRIVACY_CONTACT_EMAIL`, and `VENUE_ADDRESS`, and reads both pages before the public link is shared. The wording is a plain language notice written from what the app really does, not legal advice; if the venue wants a lawyer's read, this is the moment.
- [ ] Spec 0002's Follow-up item "Decide how long `customer_phone` is kept" is resolved here (90 days after `ends_at`); tick it there when this ships. Spec 0009's two Follow-up items (the privacy line about cookieless counts and named staff activity) are satisfied by AC-1.
- [ ] Deferred: the retention clock from the earlier of `ends_at` and `cancelled_at`, one `least()` in the `where` clause, if a customer ever asks about a cancelled booking's number.
- [ ] Deferred: a one line hint under the phone field in the staff Book sheet ("Kept 90 days after the booking") if staff want a script for what to tell customers.
- [ ] Deferred: purging `note` as well, if notes turn out to carry personal details in practice. Same function, one more column.
- [ ] When uptime monitoring lands (deferred under spec 0009), add a check that `cron.job_run_details` shows a successful run in the last two days.
- [ ] `/sync` should add to `supabase/AGENTS.md`: `pg_cron` is the scheduler, jobs are registered in migrations by name with an unschedule guard, schedules are in UTC, and a `security definer` function called by cron has execute revoked from every app role.
- [ ] The `accessibility` skill is installed and used here but not listed in root `AGENTS.md`'s `## Agent skills`; it is project wide and belongs there.
- [ ] A pre-existing, unrelated `supabase/tests/ensure_staff.test.ts` case ("makes the very first row the owner, under the bootstrap lock") now fails `npm run test:db` on the linked project: the project holds real staff and reservation rows, and the test's `delete from public.staff;` step hits a foreign key violation (`23503`) from `reservation.created_by`/`changed_by`. Not introduced by this feature (no schema this feature touched changed that behavior); needs its own fix, e.g. seeding a throwaway staff row instead of emptying the table.
