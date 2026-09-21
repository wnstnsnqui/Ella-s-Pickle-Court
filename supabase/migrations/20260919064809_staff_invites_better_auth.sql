-- Spec 0004 (revised): our side of the Better Auth move.
--
-- `staff` is re keyed from Clerk's user id to Better Auth's, every function
-- that named the old column is restated, one time links (`staff_invite`)
-- arrive with the five functions that are the only way to make, claim, peek
-- or revoke one, and `ensure_staff()` learns to hand a new row the role of the
-- invite that let it in. Policies follow a column rename on their own (they
-- are stored parsed); function bodies are stored as text and do not, which is
-- why `is_active_staff`, `is_owner`, `update_staff_role` and
-- `acknowledge_privacy_notice` all appear again below, unchanged except for
-- the column.

-- ---------------------------------------------------------------------------
-- Pre launch data goes. Every row today is test data written against Clerk
-- ids that no longer mean anything (spec 0004 migration plan).
-- ---------------------------------------------------------------------------

-- `court` and `venue_settings` point at staff too, but they are real
-- configuration, not test data: only their pointer is cleared. `delete`
-- rather than `truncate`, because truncate refuses any table another table's
-- foreign key points at, whatever the rows hold.
update public.court set changed_by = null where changed_by is not null;
update public.venue_settings set changed_by = null where changed_by is not null;

-- Reservations first: deleting one writes an audit row through its trigger,
-- and that row has to be gone too.
delete from public.reservation;
delete from public.reservation_audit;
delete from public.staff_audit;
delete from public.staff;

-- ---------------------------------------------------------------------------
-- staff: the key is a Better Auth user id now
-- ---------------------------------------------------------------------------

-- A rename keeps the primary key, the four referencing foreign keys and their
-- indexes. No cross schema foreign key to better_auth."user" on purpose: the
-- staff row outlives the identity row, and the two schemas have different
-- owners.
alter table public.staff rename column clerk_user_id to user_id;

comment on column public.staff.user_id is
  'The Better Auth user id: better_auth."user".id, and the sub of the token mintStaffToken() signs. Spec 0004.';
comment on column public.staff.email is
  'Mirrors the minted token''s email, refreshed on every sign in. Readable by active staff only, never by anon.';

-- ---------------------------------------------------------------------------
-- The policy helpers, restated for the new column, plus the new one
-- ---------------------------------------------------------------------------

-- Same signature, so `create or replace` keeps every existing grant.
create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = (select auth.jwt() ->> 'sub')
      and s.is_active
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = (select auth.jwt() ->> 'sub')
      and s.is_active
      and s.role in ('owner', 'admin', 'superadmin')
  );
$$;

-- The test `update_staff_role()` inlines, as a helper the invite functions
-- and the `staff_invite` policy can share: the caller's row is active and
-- holds `owner` or `superadmin`. Same shape and grants as the two above.
create function private.can_manage_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = (select auth.jwt() ->> 'sub')
      and s.is_active
      and s.role in ('owner', 'superadmin')
  );
$$;

comment on function private.can_manage_staff() is
  'True when the caller is an active owner or superadmin. Gates invite links and the pending list. Spec 0004.';

revoke execute on function private.can_manage_staff() from public, anon;
grant execute on function private.can_manage_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- update_staff_role(): the parameter follows the column, so drop and recreate
-- ---------------------------------------------------------------------------

-- Postgres will not rename a parameter through `create or replace`, so the
-- function is dropped and every grant restated. The body is byte for byte
-- 20260917155915_staff_roles_owner_parity.sql with `clerk_user_id` read as
-- `user_id`; the owner or superadmin check stays inlined (spec 0004 follow up).
drop function public.update_staff_role(text, text, boolean, integer);

create function public.update_staff_role(
  p_user_id text,
  p_role text,
  p_is_active boolean,
  p_version integer
)
returns public.staff
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller      text;
  v_prior_owner public.staff;
  v_demoted     public.staff;
  v_old         public.staff;
  v_new         public.staff;
begin
  v_caller := (select auth.jwt() ->> 'sub');

  if not exists (
    select 1 from public.staff s
    where s.user_id = v_caller
      and s.is_active
      and s.role in ('owner', 'superadmin')
  ) then
    raise insufficient_privilege
      using message = 'Only an owner or superadmin may change a staff member''s role or active flag.';
  end if;

  if p_user_id = v_caller then
    raise insufficient_privilege
      using message = 'You cannot change your own role or active flag.';
  end if;

  if p_role = 'owner' then
    select * into v_prior_owner
      from public.staff s
     where s.role = 'owner'
       and s.user_id <> p_user_id;

    if found then
      update public.staff s
         set role = 'admin',
             version = s.version + 1
       where s.user_id = v_prior_owner.user_id
      returning * into v_demoted;

      insert into public.staff_audit (staff_id, op, old_row, new_row, changed_by)
      values (v_prior_owner.user_id, 'update', to_jsonb(v_prior_owner), to_jsonb(v_demoted), v_caller);
    end if;
  end if;

  select * into v_old from public.staff s where s.user_id = p_user_id;

  update public.staff s
     set role = p_role,
         is_active = p_is_active,
         version = s.version + 1
   where s.user_id = p_user_id
     and s.version = p_version
  returning * into v_new;

  if not found then
    raise exception 'stale_version: staff % is not at version %',
      p_user_id, p_version
      using errcode = 'P0002';
  end if;

  insert into public.staff_audit (staff_id, op, old_row, new_row, changed_by)
  values (p_user_id, 'update', to_jsonb(v_old), to_jsonb(v_new), v_caller);

  return v_new;
end;
$$;

comment on function public.update_staff_role(text, text, boolean, integer) is
  'The only way a staff member''s role or active flag changes. Owner or superadmin only, refuses the caller''s own row, demotes a previous owner in the same transaction as a transfer. Spec 0012; re keyed by spec 0004.';

revoke execute on function public.update_staff_role(text, text, boolean, integer) from public, anon;
grant execute on function public.update_staff_role(text, text, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- acknowledge_privacy_notice(): same signature, the column only
-- ---------------------------------------------------------------------------

create or replace function public.acknowledge_privacy_notice(p_version text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub text;
  v_stored text;
begin
  v_sub := auth.jwt() ->> 'sub';
  if v_sub is null then
    raise insufficient_privilege
      using message = 'acknowledge_privacy_notice needs a signed in caller';
  end if;

  perform public.ensure_staff();

  update public.staff
     set privacy_acknowledged_at = now(),
         privacy_acknowledged_version = p_version
   where user_id = v_sub
  returning privacy_acknowledged_version into v_stored;

  if v_stored is null then
    raise no_data_found
      using message = 'no staff row for this caller';
  end if;

  return v_stored;
end;
$$;

-- ---------------------------------------------------------------------------
-- staff_invite: one time links, for a new account or a password reset
-- ---------------------------------------------------------------------------

create table public.staff_invite (
  id             uuid primary key default gen_random_uuid(),
  -- sha256 of a 32 byte random token, hex. The plain token is in the link
  -- only, shown once; this column is never granted to `authenticated`.
  token_hash     text not null unique,
  kind           text not null,
  role           text,
  target_user_id text references public.staff (user_id),
  expires_at     timestamptz not null,
  created_by     text not null references public.staff (user_id),
  created_at     timestamptz not null default now(),
  claimed_at     timestamptz,
  claimed_email  text,
  claimed_by     text,
  revoked_at     timestamptz,
  -- `= any (array[...])` rather than `in (...)` on purpose: the drift guard in
  -- lib/schedule/constants.test.ts reads `check (kind in ...)` and
  -- `check (role in ...)` back out of the migrations for reservation and staff.
  constraint staff_invite_kind_check check (kind = any (array['invite', 'reset'])),
  constraint staff_invite_role_check check (role = any (array['staff', 'admin', 'superadmin'])),
  constraint staff_invite_shape_check check (
    (kind = 'invite' and role is not null and target_user_id is null)
    or (kind = 'reset' and role is null and target_user_id is not null)
  )
);

comment on table public.staff_invite is
  'Single use, seven day links an owner or superadmin makes: an invite creates an account with the link''s role, a reset sets a password on an existing one. Rows are kept forever. Spec 0004, AC-1, AC-3, AC-7.';
comment on column public.staff_invite.token_hash is
  'encode(sha256(token), ''hex''). Never granted to authenticated; only the security definer functions below read it.';
comment on column public.staff_invite.claimed_email is
  'The email of the account being created, so ensure_staff() can hand the invite''s role to the right new row.';
comment on column public.staff_invite.claimed_by is
  'The user_id once the staff row exists (invites) or the target (resets).';

-- The pending list reads newest first and only ever wants live rows.
create index staff_invite_pending_idx
  on public.staff_invite (created_at desc)
  where claimed_at is null and revoked_at is null;

-- The two foreign keys above, indexed so a staff row lookup never scans.
create index staff_invite_created_by_idx on public.staff_invite (created_by);
create index staff_invite_target_user_id_idx on public.staff_invite (target_user_id);

alter table public.staff_invite enable row level security;

-- A new table is auto exposed to anon and authenticated with full
-- privileges, so it is narrowed at once. A column list on the select grant,
-- on purpose: `token_hash` is not in it, and `authenticated` never sees it.
-- No insert, update or delete grant to anyone; the functions below are the
-- only writers.
revoke all on public.staff_invite from public, anon, authenticated;
grant select (id, kind, role, target_user_id, expires_at, created_by, created_at, claimed_at, claimed_by, revoked_at)
  on public.staff_invite to authenticated;

create policy "owner or superadmin may read invite links"
  on public.staff_invite for select to authenticated
  using ((select private.can_manage_staff()));

-- ---------------------------------------------------------------------------
-- The link functions. All security definer with an empty search_path; each
-- one checks the caller itself. `anon` can execute none of them.
-- ---------------------------------------------------------------------------

-- Makes a link. The token was hashed by the Server Action; this function
-- never sees the plain value. `created_by` and `expires_at` come from the
-- token and the database clock, never from the caller.
create function public.create_staff_invite(
  p_kind text,
  p_role text,
  p_target_user_id text,
  p_token_hash text
)
returns public.staff_invite
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller text;
  v_row    public.staff_invite;
begin
  v_caller := (select auth.jwt() ->> 'sub');

  if not (select private.can_manage_staff()) then
    raise insufficient_privilege
      using message = 'Only an owner or superadmin may make a link.';
  end if;

  if p_kind = 'reset' then
    if p_target_user_id is null or p_target_user_id = v_caller then
      raise exception 'A reset link is for another active account, not your own.'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.staff s
       where s.user_id = p_target_user_id and s.is_active
    ) then
      raise exception 'That account is not active, so it cannot be given a reset link.'
        using errcode = '22023';
    end if;
  elsif p_kind = 'invite' then
    -- The same two person cap spec 0012 keeps in the screen, kept here too
    -- because a link is a second door into the role.
    if p_role = 'superadmin' and (
      select count(*) from public.staff s where s.role = 'superadmin'
    ) >= 2 then
      raise exception 'Two accounts already hold superadmin.'
        using errcode = '22023';
    end if;
  else
    raise exception 'A link is an invite or a reset.'
      using errcode = '22023';
  end if;

  insert into public.staff_invite (kind, role, target_user_id, token_hash, created_by, expires_at)
  values (
    p_kind,
    case when p_kind = 'invite' then p_role end,
    case when p_kind = 'reset' then p_target_user_id end,
    p_token_hash,
    v_caller,
    now() + interval '7 days'
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_staff_invite(text, text, text, text) is
  'Makes a one time link. Owner or superadmin only; a reset must target another active account; superadmin invites stop at two holders. Spec 0004, AC-3.';

revoke execute on function public.create_staff_invite(text, text, text, text) from public, anon;
grant execute on function public.create_staff_invite(text, text, text, text) to authenticated;

-- Revokes a pending link. Zero rows (already claimed, revoked, or no such
-- id) is the same P0002 `update_staff_role()` raises for a stale version.
create function public.revoke_staff_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_staff()) then
    raise insufficient_privilege
      using message = 'Only an owner or superadmin may revoke a link.';
  end if;

  update public.staff_invite
     set revoked_at = now()
   where id = p_id
     and claimed_at is null
     and revoked_at is null;

  if not found then
    raise exception 'That link is already claimed or revoked.'
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.revoke_staff_invite(uuid) is
  'Revokes a pending link. Owner or superadmin only. Spec 0004, AC-3.';

revoke execute on function public.revoke_staff_invite(uuid) from public, anon;
grant execute on function public.revoke_staff_invite(uuid) to authenticated;

-- Claims an invite for the account about to be created. One row at most,
-- atomically: two concurrent redemptions cannot both get it. Returns the
-- role, or null when the link is not pending. Called only from Better Auth's
-- `user.create.before` hook through the auth pool, so `better_auth_app` is
-- the one role that may run it.
create function public.claim_staff_invite(p_token_hash text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  update public.staff_invite
     set claimed_at = now(),
         claimed_email = lower(btrim(p_email))
   where token_hash = p_token_hash
     and kind = 'invite'
     and claimed_at is null
     and revoked_at is null
     and expires_at > now()
  returning role into v_role;

  return v_role;
end;
$$;

comment on function public.claim_staff_invite(text, text) is
  'Claims a pending invite for the email about to be registered and returns its role, or null. Single use. better_auth_app only. Spec 0004, AC-1.';

revoke execute on function public.claim_staff_invite(text, text) from public, anon, authenticated;
grant execute on function public.claim_staff_invite(text, text) to better_auth_app;

-- Claims a reset link. Same shape; returns the target user id, or null.
-- Called by the reset Server Action through the auth pool, never with a
-- staff token, because the person resetting has no session.
create function public.claim_staff_reset(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target text;
begin
  update public.staff_invite
     set claimed_at = now(),
         claimed_by = target_user_id
   where token_hash = p_token_hash
     and kind = 'reset'
     and claimed_at is null
     and revoked_at is null
     and expires_at > now()
  returning target_user_id into v_target;

  return v_target;
end;
$$;

comment on function public.claim_staff_reset(text) is
  'Claims a pending reset link and returns the target user id, or null. Single use. better_auth_app only. Spec 0004, AC-7.';

revoke execute on function public.claim_staff_reset(text) from public, anon, authenticated;
grant execute on function public.claim_staff_reset(text) to better_auth_app;

-- Read only: what kind of link this is and, for a reset, whose email it is
-- for, so the two link pages can render before anything is claimed. Answers
-- only for a pending link. Zero rows otherwise.
create function public.peek_staff_invite(p_token_hash text)
returns table (kind text, target_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, s.email
    from public.staff_invite i
    left join public.staff s on s.user_id = i.target_user_id
   where i.token_hash = p_token_hash
     and i.claimed_at is null
     and i.revoked_at is null
     and i.expires_at > now();
$$;

comment on function public.peek_staff_invite(text) is
  'The kind of a pending link and, for a reset, the target''s email. Read only. better_auth_app only. Spec 0004.';

revoke execute on function public.peek_staff_invite(text) from public, anon, authenticated;
grant execute on function public.peek_staff_invite(text) to better_auth_app;

-- ---------------------------------------------------------------------------
-- ensure_staff(): the creation branch takes the claimed invite's role
-- ---------------------------------------------------------------------------

-- Same signature as 20260916022657_privacy_terms_retention.sql, so
-- `create or replace` keeps its grants; they are restated anyway because a
-- missed grant here breaks every sign in at once. The refresh branch is
-- unchanged: `role` and `is_active` are never in its list.
create or replace function public.ensure_staff()
returns table (
  display_name text,
  role text,
  is_active boolean,
  privacy_acknowledged_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_sub    text;
  v_name   text;
  v_email  text;
  v_role   text;
  v_invite uuid;
begin
  -- `sub`, `name` and `email` are what mintStaffToken() copies from the
  -- Better Auth session (spec 0004, AC-5, AC-6).
  v_claims := auth.jwt();
  v_sub := v_claims ->> 'sub';
  if v_sub is null then
    raise insufficient_privilege
      using message = 'ensure_staff needs a signed in caller';
  end if;

  v_email := nullif(btrim(v_claims ->> 'email'), '');
  v_name := left(coalesce(nullif(btrim(v_claims ->> 'name'), ''), v_email), 80);
  if v_name is null then
    raise check_violation
      using message = 'the session token carries no name or email; check the claims mintStaffToken() signs';
  end if;

  if exists (select 1 from public.staff s where s.user_id = v_sub) then
    update public.staff s
       set display_name = v_name,
           email = v_email,
           last_signed_in_at = now()
     where s.user_id = v_sub;
  else
    -- A first sign in. The lock serialises only first sign ins, so two of
    -- them cannot both see an empty table and both become owner.
    perform pg_advisory_xact_lock(hashtext('staff_bootstrap'));

    if not exists (select 1 from public.staff) then
      v_role := 'owner';
    else
      -- The newest claimed invite for this email that no row has taken yet.
      -- Litter from a sign up that failed after its claim stays behind
      -- harmlessly; the newest claim wins.
      select i.id, i.role into v_invite, v_role
        from public.staff_invite i
       where i.kind = 'invite'
         and i.claimed_email = lower(v_email)
         and i.claimed_by is null
       order by i.claimed_at desc
       limit 1;
      v_role := coalesce(v_role, 'staff');
    end if;

    insert into public.staff (user_id, display_name, email, role, last_signed_in_at)
    values (v_sub, v_name, v_email, v_role, now())
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          email = excluded.email,
          last_signed_in_at = now();

    if v_invite is not null then
      update public.staff_invite i
         set claimed_by = v_sub
       where i.id = v_invite;
    end if;
  end if;

  return query
    select s.display_name, s.role, s.is_active, s.privacy_acknowledged_version
      from public.staff s
     where s.user_id = v_sub;
end;
$$;

comment on function public.ensure_staff() is
  'Creates or refreshes the calling staff member''s own row from the minted token. The first row ever is the owner; after that a new row takes the role of the invite claimed for its email, else staff. Spec 0004 (revised), widened by spec 0010.';

revoke execute on function public.ensure_staff() from public, anon;
grant execute on function public.ensure_staff() to authenticated;

-- Restated: this migration adds no insert, update or delete grant on `staff`
-- or `staff_invite` for `anon` or `authenticated`. Every write above goes
-- through `security definer`, never through a grant a caller could use to
-- touch a row directly.
