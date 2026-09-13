-- Feature 5, spec 0004: a `staff` row comes from the person's own signed token.
--
-- Two new columns, and one function that is the only way a staff row is ever
-- created by the app. The function takes no parameters at all: the Clerk id,
-- the name and the email are all read from `auth.jwt()`, so the caller cannot
-- act on anyone else's row and cannot choose their own role. The very first row
-- ever created becomes the owner (spec 0004, AC-3).

-- ---------------------------------------------------------------------------
-- The two columns
-- ---------------------------------------------------------------------------

alter table public.staff
  add column email text,
  add column last_signed_in_at timestamptz;

alter table public.staff
  add constraint staff_email_check check (email is null or length(email) <= 254);

comment on column public.staff.email is
  'Clerk''s primary email, refreshed on every sign in. Readable by active staff only, never by anon.';
comment on column public.staff.last_signed_in_at is
  'Set to now() by public.ensure_staff() on every signed in page load.';

-- ---------------------------------------------------------------------------
-- ensure_staff(): create or refresh the caller's own row
-- ---------------------------------------------------------------------------

-- `security definer` because `authenticated` has no insert or update grant on
-- `public.staff` (spec 0002 tightened them away on purpose). The function runs
-- as the migration role, but only ever touches the row whose id equals the
-- `sub` claim on the caller's token. `set search_path = ''` so nothing on the
-- caller's path can shadow the objects named here.
create or replace function public.ensure_staff()
returns table (display_name text, role text, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sub    text;
  v_name   text;
  v_email  text;
begin
  -- Read the token once. `sub` is the Clerk user id; `name` and `email` are the
  -- two claims spec 0004 adds through Clerk's session token customisation.
  v_claims := auth.jwt();
  v_sub := v_claims ->> 'sub';
  if v_sub is null then
    raise insufficient_privilege
      using message = 'ensure_staff needs a signed in caller';
  end if;

  v_email := nullif(btrim(v_claims ->> 'email'), '');
  -- The trimmed name, falling back to the email, cut to the column's 80 limit.
  v_name := left(coalesce(nullif(btrim(v_claims ->> 'name'), ''), v_email), 80);
  if v_name is null then
    -- A forgotten dashboard step fails loudly on the first sign in, not silently.
    raise check_violation
      using message = 'the session token carries no name or email; check the Clerk session token claims';
  end if;

  if exists (select 1 from public.staff s where s.clerk_user_id = v_sub) then
    -- The common path: a plain refresh, no lock. `role` and `is_active` are
    -- never in this list, by design (invariant 3).
    update public.staff s
       set display_name = v_name,
           email = v_email,
           last_signed_in_at = now()
     where s.clerk_user_id = v_sub;
  else
    -- A first sign in. The lock serialises only first sign ins, so two of them
    -- cannot both see an empty table and both become owner (invariant 2). The
    -- `on conflict` covers the same person's first two requests racing.
    perform pg_advisory_xact_lock(hashtext('staff_bootstrap'));
    insert into public.staff (clerk_user_id, display_name, email, role, last_signed_in_at)
    values (
      v_sub,
      v_name,
      v_email,
      case when not exists (select 1 from public.staff) then 'owner' else 'staff' end,
      now()
    )
    on conflict (clerk_user_id) do update
      set display_name = excluded.display_name,
          email = excluded.email,
          last_signed_in_at = now();
  end if;

  return query
    select s.display_name, s.role, s.is_active
      from public.staff s
     where s.clerk_user_id = v_sub;
end;
$$;

comment on function public.ensure_staff() is
  'Creates or refreshes the calling staff member''s own row from their Clerk token. The first row ever created is the owner. Spec 0004.';

-- Only a signed in caller may run it. `anon` has no route to a staff row at all.
revoke execute on function public.ensure_staff() from public, anon;
grant execute on function public.ensure_staff() to authenticated;
