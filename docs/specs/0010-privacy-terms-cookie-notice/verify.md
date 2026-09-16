# Verify: Privacy, terms & cookie notice · spec 0010 · updated 2026-09-16

_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Visit `/privacy` signed out → renders inside the app shell, with its own title/description and no noindex, and states the sections in AC-1's order (who holds the data, what's collected from customers and why, visitor tracking, staff tracking, data locations, "never sent to PostHog", retention period, how to ask for a change, "Last updated" date) → AC-1
- [ ] Visit `/terms` signed out → states what the board is, no bookings/payments, staff accounts are authorised only, acceptable use and rate limiting, that terms may change, Philippine governing law, the contact email → AC-2
- [ ] Load `/`, `/staff`, `/staff/settings`, `/staff/reports`, `/sign-in`, `/privacy`, `/terms` → footer on every one carries working `Privacy` and `Terms` links, same contrast/focus styling as the existing "Staff sign in" link → AC-3
- [ ] Open `/staff` with a brand new staff account (never acknowledged) → the privacy notice dialog appears, blocks the page, Escape does nothing, clicking outside does nothing, there is no close (X) button → AC-10, AC-14
- [ ] In that dialog: tab through it with the keyboard only → focus never leaves the dialog, the `Acknowledge` button is reachable and operable by keyboard → AC-14
- [ ] Click the "Read the full privacy notice" link in the dialog → opens `/privacy` in a new tab, dialog stays open in the original tab → AC-10
- [ ] Click `Acknowledge` → dialog closes (page refreshes); reload `/staff` → dialog does not reappear → AC-11
- [ ] With `NEXT_PUBLIC_POSTHOG_KEY` configured, after a successful acknowledgement, check PostHog's activity feed for that user → one `privacy_notice_acknowledged` event with `version` set → AC-13
- [ ] Bump `PRIVACY_NOTICE_VERSION` in `lib/legal/constants.ts`, redeploy, open `/staff` with the same already-acknowledged account → dialog appears again → AC-12
- [ ] Sign out and load `/staff` → no dialog is ever attempted (redirected by `proxy.ts` before the layout renders) → AC-10
- [ ] Switch an active account's `staff.is_active` to false and load `/staff` → the "switched off" notice shows, no dialog → AC-10
- [ ] Force the acknowledge Server Action to fail (e.g. disconnect the network briefly) and click `Acknowledge` → dialog stays open, shows an inline error message, button is pressable again → AC-11

## Commands

- [ ] `select public.purge_customer_phones();` on a seeded booking with `ends_at` 91 days ago and a phone → returns `1`; `customer_phone` is null on the `reservation` row and on every `reservation_audit` row for it, including the newest → AC-5, AC-8
- [ ] Run `purge_customer_phones()` a second time immediately after → returns `0` → AC-5
- [ ] `select * from cron.job where jobname = 'purge_customer_phones';` → one row, `schedule = '0 19 * * *'`, `active = true` → AC-6
- [ ] After a night has passed, `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'purge_customer_phones') order by start_time desc limit 1;` → a `succeeded` run recorded → AC-15
- [ ] `set local role authenticated; select public.purge_customer_phones();` → `42501 permission denied` → AC-6
- [ ] `set local role anon; select public.purge_customer_phones();` → `42501 permission denied` → AC-6
- [ ] As a signed in caller (own `sub`), `select public.acknowledge_privacy_notice('<current version>');` → returns the version, `staff.privacy_acknowledged_at`/`privacy_acknowledged_version` set for that row only, no other row changes → AC-9
- [ ] As a signed out caller, `select public.acknowledge_privacy_notice('<version>');` → `insufficient_privilege` → AC-9
- [ ] As a signed in caller with no `staff` row, `select public.acknowledge_privacy_notice('<version>');` → `no_data_found` → AC-9
- [ ] `select pg_get_functiondef('public.purge_customer_phones'::regproc);` → contains `interval '90 days'`, matching `PHONE_RETENTION_DAYS` in `lib/legal/constants.ts` → AC-7
- [ ] `npm run check` → lint, format check, typecheck, and unit tests all green → AC-15
- [ ] `npm run test:db` → green, aside from the pre-existing unrelated `ensure_staff.test.ts` failure noted in the spec's Follow-up → AC-15

## Value sourcing spot checks

- [ ] `/privacy`'s controller name/email/address change when `lib/legal/constants.ts`'s `VENUE_LEGAL_NAME`/`PRIVACY_CONTACT_EMAIL`/`VENUE_ADDRESS` change → confirms the page has no second source for these facts
- [ ] `/privacy`'s printed retention number changes when `PHONE_RETENTION_DAYS` changes, and the database test (AC-7) still passes only when the SQL interval is edited to match → confirms the drift guard actually guards
- [ ] The staff layout's dialog `open` prop flips only on `privacyAcknowledgedVersion !== PRIVACY_NOTICE_VERSION`: verified by `app/staff/layout.test.ts`'s five states (signed out, inactive, unacknowledged, acknowledged, version bumped)
- [ ] `purge_customer_phones()` never touches a `kind = 'closed'` row or a booking with `ends_at` inside the retention window: verified by `supabase/tests/purge_customer_phones.test.ts`'s untouched-rows case

## Acceptance-criteria coverage

- AC-1 · `/privacy` renders, sections, order · covered by UI step 1, unit tests in `app/privacy/page.test.ts`
- AC-2 · `/terms` renders, sections · covered by UI step 2, unit tests in `app/terms/page.test.ts`
- AC-3 · footer links everywhere · covered by UI step 3, `components/app-shell.test.ts`
- AC-4 · constants are the single source · covered by value sourcing spot check 1, `app/privacy/page.test.ts`
- AC-5 · `purge_customer_phones()` behavior · covered by Commands steps 1-2, `supabase/tests/purge_customer_phones.test.ts`
- AC-6 · schedule and permissions · covered by Commands steps 3, 5-6, `supabase/tests/purge_customer_phones.test.ts`
- AC-7 · drift guard · covered by Commands step 10, value sourcing spot check 2
- AC-8 · a purged booking still reads as a booking · covered by Commands step 1 (audit + reservation both checked), `supabase/tests/purge_customer_phones.test.ts`
- AC-9 · migration, `ensure_staff()` widened, `acknowledge_privacy_notice()` · covered by Commands steps 7-9, `supabase/tests/acknowledge_privacy_notice.test.ts`
- AC-10 · the dialog gate · covered by UI steps 4, 9-10, `app/staff/layout.test.ts`
- AC-11 · the acknowledge Server Action · covered by UI steps 6-7, 11, `lib/legal/actions.test.ts`
- AC-12 · version bump reopens the dialog · covered by UI step 8, `app/staff/layout.test.ts`
- AC-13 · the analytics event · covered by UI step 7, `lib/legal/actions.test.ts`
- AC-14 · accessibility · covered by UI steps 4-5
- AC-15 · full green + real project proof · covered by Commands steps 1-4, 11-12 (step 4 not yet run: pending an elapsed night)
