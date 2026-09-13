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
