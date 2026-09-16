# Verify: analytics & error alerts · spec 0009 · updated 2026-09-16

_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the
durable ones. The live PostHog checks below (marked "needs a real PostHog project key") were not
run during the build itself: that environment had no PostHog account or project key, and
development is designed to send nothing (AC-9), so there was nothing to prove them against._

_The engineer marked the feature `done` on 2026-09-16 after confirming a subset of these live,
ad hoc, in conversation rather than as a full `/check verify` pass — see which boxes are ticked
below. **Not yet done: the Slack destination in AC-8 (the spec named Discord originally; `/architect`
corrected it to Slack on 2026-09-16 after PostHog dropped its native Discord integration, see
[rationale.md](rationale.md)), the deliberate error/alert proof in AC-6/AC-7/AC-8, the PostHog
project settings and dashboard in AC-11/AC-12.** These stay open until someone runs them._

## UI / manual

- [x] With `NEXT_PUBLIC_POSTHOG_KEY` unset, run `npm run dev` and `npm run build`; both behave
      exactly as before this feature landed → AC-9 · confirmed via `npm run check` and a local
      `npm run build` with no key, both clean
- [x] `npm run build && npm start` (or `npm run dev`) with the key set, then load `/` in a browser:
      PostHog's activity feed shows a `$pageview` and a `board_day_viewed` with `day_offset: 0` →
      AC-1 (event only), AC-2 · confirmed live on 2026-09-16 — **the `document.cookie`/`ph_`
      storage check itself was not separately confirmed**
- [ ] Navigate the public board to a different day (via the day toolbar): PostHog shows a second
      `$pageview` and a second `board_day_viewed` with the new `day_offset`, never a third capture
      for the same day → AC-2
- [x] Sign in as staff, visit `/staff`: PostHog shows the person identified by their Clerk id, with
      `display_name` and `role` as person properties (visible on the person's Properties tab, or in
      the expanded "Set person properties" event) → AC-3 · confirmed live on 2026-09-16
- [x] Sign out, then sign in as a second staff account on the same browser: the second person's
      events land on their own id, with no merge to the first → AC-3 · confirmed live on
      2026-09-16 (two distinct Clerk ids seen in the activity feed, each with their own "Set person
      properties")
- [x] As staff, create a booking: PostHog shows one `booking_created` against that Clerk id →
      AC-4 (event fires) · confirmed live on 2026-09-16 — **the exact property set
      (`reservation_id`, `court_id`, `court_name`, `kind`, `action`, `starts_at`, `ends_at`,
      `duration_minutes`, `lead_time_hours`, and nothing else) was not individually checked; expand
      the event in PostHog to confirm** → AC-5
- [ ] Edit, then cancel that booking: one `booking_edited`, then one `booking_cancelled`, each with
      `action` matching → AC-4 · **not run**
- [ ] As owner, rename a court, add a note, restore a retired court, retire a court, and reorder
      the court list: PostHog shows `court_changed` with `action` = `renamed`, `note`, `restored`,
      `retired`, `reordered` respectively, and a save that changes neither name nor note sends
      nothing → AC-4 · **not run**
- [ ] As owner, change the opening hours: PostHog shows `hours_changed` with the six settings
      values, closing times read back as `HH:MM` (a `24:00` close stays `24:00`, never `00:00`) →
      AC-4, Value sourcing (`hours_changed`) · **not run**
- [ ] Visit a hidden test route that throws (add one temporarily, per the spec's Build plan item 3,
      then delete it): PostHog shows one `$exception` with `route_type: "route"`, and exactly one
      **Slack** message with the issue title and a link, via PostHog's native Slack integration
      (AC-8); throwing the same error again produces no second Slack message → AC-6, AC-8 · **not
      run**
- [ ] Force a `failed` result (e.g. stub a `PostgrestError` with `details`/`hint` set): PostHog
      shows an `ActionFailed` exception whose message is `<action>: <code> <message>`, with no
      `details` or `hint` anywhere on it; a `slot_taken` conflict from the same code path produces
      no exception → AC-7 · **not run live** (covered by `lib/actions.test.ts`'s unit test)
- [ ] Confirm in the PostHog project settings: session replay, autocapture, surveys, heatmaps and
      web vitals are off; error tracking exception autocapture is on; the Slack destination fires
      only on issue created/reopened, not per occurrence → AC-8, AC-11, AC-12 · **not run**
- [ ] Confirm cookieless mode is enabled in the PostHog project settings (`cookieless_mode:
      "always"` is silently ignored by PostHog's ingestion otherwise) → AC-1 · **not run**
- [ ] Build and pin the "Ella's Picklecourt" dashboard (the seven insights in AC-11), invite Ella
      as a project member, and record the settings above in this file once confirmed → AC-11,
      AC-12 · **not run**

## Commands

- [x] `npm run check` (lint, format, typecheck, unit tests) → AC-4, AC-5, AC-7, AC-9 · green on
      2026-09-16
- [x] `npx vitest run proxy.test.ts` → confirms `POST /ingest/e/` is neither rate limited nor
      redirected, while `GET /` still is → AC-10 · covered by `npm run check` above
- [x] `npm run build` with no `NEXT_PUBLIC_POSTHOG_KEY` set → no Edge Runtime warning, no analytics
      code path touched → AC-9 · confirmed clean on 2026-09-15

## Acceptance-criteria coverage

- AC-1 (cookieless public `$pageview`, no `ph_` storage) — event confirmed live 2026-09-16; the
  no-cookie/no-storage half is **not confirmed**
- AC-2 (`board_day_viewed`, once per shown day) — first-paint case confirmed live 2026-09-16; the
  day-change case is **not confirmed**
- AC-3 (staff identified by Clerk id, reset on sign out) — confirmed live 2026-09-16 (two accounts,
  no merge); `resetIdentity()` on sign out is wired but **not separately confirmed**
- AC-4 (one event per successful write) — `booking_created` confirmed live 2026-09-16;
  `booking_edited`/`booking_cancelled`/`court_changed`/`hours_changed` are wired and unit-tested
  (`lib/schedule/actions.test.ts`, `analytics events (spec 0009, AC-4)`) but **not confirmed live**
- AC-5 (allow list, no customer data) — `lib/analytics/properties.test.ts`, `npm run check`
- AC-6 (unexpected throw → `$exception`) — **not run**
- AC-7 (a `failed` result → scrubbed exception) — `lib/actions.test.ts` ("reports only the unnamed
  failed branch"); **not confirmed live**
- AC-8 (one Slack message per new/reopened issue) — **not run**
- AC-9 (off switch; capture never changes an outcome) — `lib/analytics/server.test.ts` ("off
  switch"), Commands steps 1 and 3, both green
- AC-10 (browser only talks to `/ingest`) — `proxy.test.ts`, part of `npm run check`
- AC-11 (the dashboard) — **not run**
- AC-12 (replay/autocapture/surveys off) — code config only (`instrumentation-client.ts`); the
  PostHog project settings themselves are **not confirmed**
