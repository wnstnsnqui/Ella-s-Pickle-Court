-- A new table in `public` is auto exposed to `anon` and `authenticated` with
-- full privileges on this project, so the grants the court schedule migration
-- wrote were a superset rather than the whole story. Row level security still
-- refused every write that should not happen, which a probe confirmed, but the
-- security model in spec 0002 says these privileges do not exist at all, and a
-- grant nothing needs is a grant that only ever helps a mistake along.
--
-- After this, the privileges are exactly what the spec lists and nothing more.

-- Nobody deletes anything, on any table. Reservations are cancelled and courts
-- are retired.
revoke delete on public.staff from anon, authenticated;
revoke delete on public.court from anon, authenticated;
revoke delete on public.reservation from anon, authenticated;
revoke delete on public.venue_settings from anon, authenticated;
revoke delete on public.reservation_audit from anon, authenticated;

-- Anon reads the public grid and writes nothing, ever.
revoke insert, update on public.staff from anon;
revoke insert, update on public.court from anon;
revoke insert, update on public.reservation from anon;
revoke insert, update on public.venue_settings from anon;
revoke insert, update on public.reservation_audit from anon;

-- Anon has no business knowing who works here or reading the audit trail, and
-- the four column grant is the only thing it holds on `reservation`.
revoke select on public.staff from anon;
revoke select on public.reservation_audit from anon;

-- The audit trail is written by its trigger and by nothing else. Staff read it.
revoke insert, update on public.reservation_audit from authenticated;

-- Feature 5 owns creating a staff row on first sign in, and will grant what it
-- needs then. Until it exists, staff rows come from an owner or the CLI.
revoke insert, update on public.staff from authenticated;
