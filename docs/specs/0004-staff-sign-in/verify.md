# Verify: staff sign in · spec 0004 · updated 2026-09-13

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_Before any of this can run, the dashboard prerequisites in the spec's Configuration section have to be done (Clerk: Restricted sign up, the three sign in methods, both session settings at 30 days, the Supabase integration, the session token claims `name` and `email`, the invitation redirect URL; Supabase: Clerk as a third party auth provider). The `staff` table was confirmed empty on 2026-09-13, so the first person to sign in becomes the owner. Make sure that person is Ella._

## UI / manual

- [ ] Invite Ella from the Clerk dashboard, open the invitation link → it lands on `/sign-up` inside the app shell with the Clerk card and the line "This board is for staff. Ask Ella for an invitation if you need one." under it → AC-1, AC-10
- [ ] Finish creating the account → you land on `/` with "Ella" (the Clerk full name) and a Sign out button in the header band → AC-1, AC-4
- [ ] In the Supabase SQL editor, `select clerk_user_id, display_name, email, role, is_active, last_signed_in_at from public.staff` → one row, `role = 'owner'`, `is_active = true`, `email` is the Clerk primary email, `last_signed_in_at` is set → AC-3
- [ ] Invite a second person and repeat → their row appears with `role = 'staff'`; Ella's row still says `owner` → AC-3
- [ ] Change that second person's name in Clerk (account modal or dashboard), reload `/` → the header and their `display_name` show the new name; `role` and `is_active` unchanged → AC-3 (value: `display_name` mirrors the `name` claim)
- [ ] Clear the second person's name in Clerk so it is blank, reload `/` → the header shows their email address instead → AC-3 (value: name falls back to the `email` claim)
- [ ] Sign out on a phone that stays signed in for a day, or close and reopen the browser → still signed in, no prompt → AC-2
- [ ] Sign in at `/sign-in` with each method: email plus one time code, email plus password, Google → each lands on `/` → AC-1
- [ ] Press Sign out → you are on `/`, the header shows only the theme button, the footer shows "Staff sign in" → AC-4
- [ ] Signed out, open `/` → no staff controls in the header, one "Staff sign in" link in the footer → AC-4 (value: footer link shows only when signed out)
- [ ] Signed in, open `/sign-in` and `/sign-up` directly → both redirect to `/` → AC-4 (value: `auth().isAuthenticated` then `redirect('/')`)
- [ ] Signed out, try `/sign-in` with an email that was never invited → Clerk refuses with its own message and the staff only line stays visible beside it → AC-1
- [ ] Open `/sign-up` with no invitation ticket → Clerk refuses; the staff only line stays visible → AC-1
- [ ] Press the name in the header → Clerk's account modal opens on our tokens; close it → AC-4 (value: `openUserProfile()`)
- [ ] In the SQL editor, `update public.staff set is_active = false where clerk_user_id = '<second person>'`, then reload `/` as them → the board renders, the header shows "Your account is switched off" with a Sign out button → AC-5
- [ ] As that inactive person, make any booking write (once feature 6 lands its booking UI; there is no app path to `createReservation` before that) → the result is `forbidden` → AC-5
- [ ] Set `is_active` back to true → the name returns on the next reload → AC-5
- [ ] Break the database on purpose (point `NEXT_PUBLIC_SUPABASE_URL` at a wrong host, or revoke execute on `ensure_staff` from `authenticated` in a scratch branch), reload `/` signed in → the board still renders, the header shows "Could not load your account" with a Sign out button, and the server log has a `currentStaff:` error line → AC-8
- [ ] Make the call hang (a mocked client that never resolves, or a firewall rule) → the board's HTML arrives at once and the notice appears about 3 seconds later, never a blank page → AC-8 (value: the 3 second abort)
- [ ] Remove the `name` and `email` claims from Clerk's session token customisation, sign in → the header shows the error notice and the server log names the Clerk session token claims; put the claims back → AC-3, AC-8
- [ ] Leave a signed in tab idle for 5 minutes (longer than a Clerk token's life), then trigger a Server Action → it succeeds → AC-7
- [ ] Sign in as a freshly invited person and make a first booking (through feature 6, which owns the first booking UI) → `changed_by` on the reservation equals their Clerk id → AC-9
- [ ] Open `/design` in both themes → the four new "on a card" rows in the contrast table pass → AC-10
- [ ] On `/sign-in`, Tab through the page → focus moves through the Clerk card in order with a visible ring on every control, and the Continue button works from the keyboard → AC-10
- [ ] View source on `/sign-in` and `/sign-up` → `<meta name="robots" content="noindex, nofollow">` → AC-10
- [ ] Pin dark, then light, with the header theme button on `/sign-in` → the Clerk card follows the tokens each time (card, primary button, input boundary) → AC-10
- [ ] Sign out with the network switched off → a toast says it could not sign out, and the button is still there → AC-4

## Commands

- [ ] `npx supabase db query --linked "begin; set local role anon; select * from public.ensure_staff(); rollback;"` → `42501 permission denied for function ensure_staff` → AC-6
- [ ] `npx supabase db query --linked "begin; set local role anon; insert into public.staff (clerk_user_id, display_name) values ('x','x'); rollback;"` → permission denied → AC-6
- [ ] `npx supabase db query --linked "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"probe\",\"role\":\"authenticated\"}',true); select * from public.ensure_staff(); rollback;"` → `23514 the session token carries no name or email; check the Clerk session token claims` → AC-3
- [ ] `npx supabase db query --linked "begin; set local role authenticated; select set_config('request.jwt.claims','{\"role\":\"authenticated\"}',true); select * from public.ensure_staff(); rollback;"` → `42501 ensure_staff needs a signed in caller` → AC-6
- [ ] Signed out, call any Server Action (`npm test` pins this in `lib/actions.test.ts`; live, through feature 6 with no session) → the result is `unauthenticated` and nothing reached the database → AC-6
- [ ] `npx supabase db advisors --linked` → only the expected `authenticated_security_definer_function_executable` warning for `ensure_staff`, which is the design → AC-6
- [ ] `npm run check` → lint, format, typecheck and 162 tests pass (the 10 database tests skip here) → AC-3, AC-4, AC-5, AC-8, AC-10
- [ ] `npm run test:db` → the 10 `ensure_staff` cases in `supabase/tests/ensure_staff.test.ts` pass against the linked project, every one inside a rolled back transaction → AC-3, AC-5, AC-6

## Acceptance-criteria coverage

- AC-1 invited sign up, three methods, uninvited refused, staff only line · steps 1, 2, 8, 12, 13
- AC-2 session survives refresh and reopen, 30 days · step 7
- AC-3 row created and refreshed from the token, first row owner, role and active untouched · steps 3, 4, 5, 6, 20; commands 3
- AC-4 name and sign out in the header, sign out lands on `/`, footer link when signed out, redirect · steps 2, 9, 10, 11, 14, 27
- AC-5 inactive notice, writes refused as `forbidden` · steps 15, 16, 17
- AC-6 signed out changes nothing, anon refused at the function and the table · commands 1, 2, 4, 5, 6, 8
- AC-7 long idle tab still writes · step 21
- AC-8 board renders without the row, error notice, 3 second abort, logged · steps 18, 19, 20
- AC-9 first booking carries `changed_by` · step 22
- AC-10 tokens in both themes, keyboard, contrast, noindex · steps 1, 23, 24, 25, 26

---

# Verify: staff sign in (Better Auth revision) · spec 0004 · updated 2026-09-19

_Steps derived from the revised spec 0004 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. The section above describes the Clerk build and is stale._

_Before any of this can run: `npx supabase db push --linked` (migrations 20260919064807 and 20260919064809, which truncate the test bookings and staff rows), `alter role better_auth_app password '...'` in the SQL editor, and `.env.local` filled from `.env.example` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_DATABASE_URL`, `SUPABASE_JWT_SECRET`, `BOOTSTRAP_OWNER_EMAIL`, optionally the Google pair). Then `npx supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts` and `npm run check`._

## UI / manual

- [x] `GET /api/auth/ok` → `{ "ok": true }` → AC-11
- [ ] With Better Auth's `user` table empty, open `/sign-up` → the bootstrap form (name, email, password, password again), no Google button → AC-2
- [x] Submit it with an email other than `BOOTSTRAP_OWNER_EMAIL` → refused with "This board is for staff. Ask Ella for an invite link if you need one." → AC-2
- [x] Submit it with `BOOTSTRAP_OWNER_EMAIL` in mixed case with spaces around it → account created, you land on `/staff` with your first name in the header → AC-2, AC-5
- [x] `select user_id, display_name, email, role from public.staff` → one row, `role = 'owner'`, `user_id` equals `better_auth."user".id`, `email` lower cased → AC-5, AC-6, invariant 4
- [x] Open `/sign-up` again in a private window → only the staff only line and "I already have an account", no form → AC-2
- [x] Book one court on `/staff` → `select changed_by, created_by from public.reservation` shows your Better Auth user id → AC-6
- [ ] Close the browser, reopen it, open `/staff` → still signed in, no sign in page → AC-4
- [x] Sign out from the header → you land on `/` with no staff controls and "Staff sign in" in the footer → AC-4
- [x] Open `/staff/reports?range=week` signed out → redirected to `/sign-in?redirect=%2Fstaff%2Freports%3Frange%3Dweek`; sign in → you land on `/staff/reports?range=week` → AC-10, AC-4
- [x] Open `/sign-in?redirect=https://example.com` and sign in → you land on `/staff`, never off site → AC-4 (Value sourcing: where to land)
- [x] Sign in with a wrong password → "Email or password is wrong." under the form, focus back on the password field → AC-4
- [x] Four wrong sign in attempts inside ten seconds → the fourth says "Too many attempts" (a 429) → AC-14
- [ ] On `/staff/admin/users` as owner: Make a link → A new account, role Staff → the dialog shows the full `/sign-up/<token>` link once with Copy and the "cannot be shown again" note; the Links list shows Invite · Staff account · Made by you · Expires in 7 days (venue time) → AC-3
- [ ] Make a link with role Superadmin when two accounts already hold it → the option is disabled; via the Server Action directly → refused "Two accounts already hold superadmin." → AC-3
- [x] Open the invite link in a private window → the create account form with a Continue with Google button (when Google is configured) → AC-1
- [x] Submit it by email and password → account created, lands on `/staff` as `staff`; the link is gone from the pending list; `staff_invite` row has `claimed_at`, `claimed_email`, `claimed_by` set → AC-1, AC-3, AC-5
- [x] Open the same invite link again → "This link cannot be used" and the staff only line, no form → AC-1
- [x] Make an Admin invite and redeem it → the new row's `role` is `admin` → AC-5 (Value sourcing: role on creation)
- [ ] Redeem an invite with an email that already has an account → "That email already has an account. Ask for a reset link instead." under the email field; the link is still pending → AC-1
- [ ] `curl -X POST $BETTER_AUTH_URL/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"x","email":"x@example.com","password":"passwordpassword"}'` with no cookie → 403 with the staff only line; repeat with `-H 'cookie: staff_invite=<value from a used link>'` → 403 → AC-1
- [x] Revoke a pending link → gone from the list; opening it → "This link cannot be used" → AC-3
- [x] As a `staff` account, open `/staff/admin/users` → redirected to `/staff`; call `createStaffInvite` directly → `forbidden`; `select * from public.staff_invite` as that account's token → zero rows → AC-3, AC-10
- [ ] Google (when configured): on `/sign-in`, Continue with Google with an email that has no account → back on `/sign-in` with the staff only line; with an existing account's email → signed in, and Account page reads "Google linked" → AC-4, AC-9
- [ ] Google: open a fresh invite link, Continue with Google → account created with the invite's role, the link is claimed → AC-1, AC-4
- [x] Make a reset link for another active account → `/reset/<token>` shows that account's email read only and two password fields → AC-7 (Value sourcing: target user)
- [ ] Make a reset link for yourself → refused "A reset link is for another active account, not your own." → AC-3
- [x] With the target signed in on another browser, submit the reset form → lands on `/sign-in?reset=1` with the "Your password was changed" notice; the other browser is signed out on its next request; the old password fails, the new one works → AC-7
- [x] Open the used reset link again → "This link cannot be used" → AC-7
- [x] Deactivate an account that is signed in elsewhere → `select count(*) from better_auth.session where "userId" = '<id>'` is 0; that browser's next `/staff` request is the sign in page → AC-8
- [ ] Reactivate it → the person must sign in again; then the board works → AC-8
- [x] Account page → Change password with the wrong current password → field error; with the right one → toast, other devices signed out, this one stays → AC-9
- [ ] Account page → Link Google (unlinked account) → Google round trip, back on `/staff`, page reads "Google linked" → AC-9
- [ ] Stop Postgres (or point `BETTER_AUTH_DATABASE_URL` at a dead host) → `/` still renders the public board; `/sign-in` submit shows "Could not sign in right now"; `console.error` has the cause → AC-15
- [ ] Open `/sign-in`, `/sign-up`, `/sign-up/<token>`, `/reset/<token>` with a keyboard only → every field, button and link reachable in order, focus visible; view source → `<meta name="robots" content="noindex, nofollow">` → AC-16
- [ ] Open `/design` in both themes → every "on a card" pair passes → AC-16
- [ ] Open `/staff` on two devices, book on one → the other refetches within a second or two; in the browser's network tab the websocket join carries the anon key, and `lib/supabase/staff-browser.ts` does not exist → AC-12
- [ ] In PostHog (when configured): `staff_invite_created` (kind, role), `staff_invite_revoked` (kind), `staff_invite_redeemed` (kind, method password or google), `staff_password_changed` (source reset or account) each arrive once, and `$identify` carries the Better Auth user id → AC-13
- [x] `select rolname, rolbypassrls from pg_roles where rolname = 'better_auth_app'` → `false`; `select has_schema_privilege('anon', 'better_auth', 'usage'), has_schema_privilege('authenticated', 'better_auth', 'usage')` → both `false`; `select has_column_privilege('authenticated', 'public.staff_invite', 'token_hash', 'select')` → `false` → AC-10
- [ ] Decode a minted token (log one from `mintStaffToken()` in dev) → `sub`, `role: authenticated`, `aud: authenticated`, `email`, `name`, `iat`, `exp = iat + 300`, nothing else → AC-6 (Value sourcing: mintStaffToken claims)

## Commands

- [x] `npm run check` → green → AC-11
- [ ] `npm run test:db` → the `staff_invite`, `ensure_staff`, `update_staff_role` and `policy_helpers` suites pass → AC-1, AC-3, AC-5, AC-7, AC-10
- [x] `grep -rni clerk app lib components proxy.ts package.json .env.example Dockerfile` → only `AGENTS.md` context lines (for `/sync`) → AC-11
- [x] `npx supabase db advisors --linked` → no new security finding on `staff_invite` or `better_auth` → AC-10
- [x] `npm run build` → succeeds with no `BETTER_AUTH_SECRET` set; `NODE_ENV=production node .next/standalone/server.js` with no secret → refuses on the first request → AC-11

## Acceptance-criteria coverage

- AC-1 invite only creation · AC-2 bootstrap · AC-3 links on the users screen · AC-4 sign in, Google, session, sign out · AC-5 `ensure_staff` role and mirror · AC-6 the minted token and `changed_by` · AC-7 reset links · AC-8 deactivation ends sessions · AC-9 account page · AC-10 signed out can change nothing, grants · AC-11 Clerk gone, production refuses without the secret · AC-12 staff listener on the anon client · AC-13 analytics · AC-14 rate limit · AC-15 failure handling · AC-16 the four forms
