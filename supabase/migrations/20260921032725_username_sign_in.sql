-- Spec 0004 (revised): staff sign in with a username and a password, never an
-- email.
--
-- Better Auth's `username` plugin reads and writes one new column on its
-- `user` table. On our side the email that `staff` mirrored and that an
-- invite was claimed for becomes the username, and the three functions that
-- named it are restated. The email column on better_auth."user" stays, because
-- Better Auth requires one; from now on it holds a placeholder the app derives
-- from the username, and nothing reads it.
--
-- Existing accounts get a username from the local part of their email, so the
-- owner can still sign in after this lands (and can change it on the account
-- page).

-- ---------------------------------------------------------------------------
-- better_auth."user": the column the username plugin expects
-- ---------------------------------------------------------------------------

alter table better_auth."user" add column "username" text unique;

comment on column better_auth."user"."username" is
  'Sign in name, lower cased, unique. Written by Better Auth''s username plugin. Spec 0004.';

-- Backfill: the local part of the email, lower cased, anything outside the
-- allowed characters replaced by an underscore, cut to leave room for a
-- numeric suffix that settles two emails sharing a local part.
with candidate as (
  select
    u.id,
    left(lower(regexp_replace(split_part(u.email, '@', 1), '[^A-Za-z0-9_.]', '_', 'g')), 27) as base,
    row_number() over (
      partition by left(lower(regexp_replace(split_part(u.email, '@', 1), '[^A-Za-z0-9_.]', '_', 'g')), 27)
      order by u."createdAt", u.id
    ) as n
  from better_auth."user" u
  where u.username is null
)
update better_auth."user" u
   set username = case when c.n = 1 then c.base else c.base || '_' || c.n end
  from candidate c
 where c.id = u.id;

-- ---------------------------------------------------------------------------
-- staff: the mirrored column is the username now
-- ---------------------------------------------------------------------------

alter table public.staff rename column email to username;
alter table public.staff drop constraint staff_email_check;

-- Mirror what Better Auth now holds; a row with no identity behind it (none
-- expected) is left null and refreshed on its next sign in.
update public.staff s
   set username = (select u.username from better_auth."user" u where u.id = s.user_id);

alter table public.staff
  add constraint staff_username_check check (username is null or length(username) <= 30);

comment on column public.staff.username is
  'Mirrors the minted token''s username, refreshed on every sign in. Readable by active staff only, never by anon.';

-- ---------------------------------------------------------------------------
-- staff_invite: an invite is claimed for a username
-- ---------------------------------------------------------------------------

alter table public.staff_invite rename column claimed_email to claimed_username;

comment on column public.staff_invite.claimed_username is
  'The username of the account being created, so ensure_staff() can hand the invite''s role to the right new row.';

-- ---------------------------------------------------------------------------
-- claim_staff_invite(): the parameter is renamed, so drop and recreate
-- ---------------------------------------------------------------------------

drop function public.claim_staff_invite(text, text);

create function public.claim_staff_invite(p_token_hash text, p_username text)
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
         claimed_username = lower(btrim(p_username))
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
  'Claims a pending invite for the username about to be registered and returns its role, or null. Single use. better_auth_app only. Spec 0004, AC-1.';

revoke execute on function public.claim_staff_invite(text, text) from public, anon, authenticated;
grant execute on function public.claim_staff_invite(text, text) to better_auth_app;

-- ---------------------------------------------------------------------------
-- peek_staff_invite(): the return shape changes, so drop and recreate
-- ---------------------------------------------------------------------------

drop function public.peek_staff_invite(text);

create function public.peek_staff_invite(p_token_hash text)
returns table (kind text, target_username text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, s.username
    from public.staff_invite i
    left join public.staff s on s.user_id = i.target_user_id
   where i.token_hash = p_token_hash
     and i.claimed_at is null
     and i.revoked_at is null
     and i.expires_at > now();
$$;

comment on function public.peek_staff_invite(text) is
  'The kind of a pending link and, for a reset, the target''s username. Read only. better_auth_app only. Spec 0004.';

revoke execute on function public.peek_staff_invite(text) from public, anon, authenticated;
grant execute on function public.peek_staff_invite(text) to better_auth_app;

-- ---------------------------------------------------------------------------
-- ensure_staff(): reads `username` from the token instead of `email`
-- ---------------------------------------------------------------------------

-- Same signature as 20260919064809_staff_invites_better_auth.sql, so
-- `create or replace` keeps its grants; restated anyway because a missed
-- grant here breaks every sign in at once.
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
  v_claims   jsonb;
  v_sub      text;
  v_name     text;
  v_username text;
  v_role     text;
  v_invite   uuid;
begin
  -- `sub`, `name` and `username` are what mintStaffToken() copies from the
  -- Better Auth session (spec 0004, AC-5, AC-6).
  v_claims := auth.jwt();
  v_sub := v_claims ->> 'sub';
  if v_sub is null then
    raise insufficient_privilege
      using message = 'ensure_staff needs a signed in caller';
  end if;

  v_username := lower(nullif(btrim(v_claims ->> 'username'), ''));
  v_name := left(coalesce(nullif(btrim(v_claims ->> 'name'), ''), v_username), 80);
  if v_name is null then
    raise check_violation
      using message = 'the session token carries no name or username; check the claims mintStaffToken() signs';
  end if;

  if exists (select 1 from public.staff s where s.user_id = v_sub) then
    update public.staff s
       set display_name = v_name,
           username = v_username,
           last_signed_in_at = now()
     where s.user_id = v_sub;
  else
    -- A first sign in. The lock serialises only first sign ins, so two of
    -- them cannot both see an empty table and both become owner.
    perform pg_advisory_xact_lock(hashtext('staff_bootstrap'));

    if not exists (select 1 from public.staff) then
      v_role := 'owner';
    else
      -- The newest claimed invite for this username that no row has taken
      -- yet. Litter from a sign up that failed after its claim stays behind
      -- harmlessly; the newest claim wins.
      select i.id, i.role into v_invite, v_role
        from public.staff_invite i
       where i.kind = 'invite'
         and i.claimed_username = v_username
         and i.claimed_by is null
       order by i.claimed_at desc
       limit 1;
      v_role := coalesce(v_role, 'staff');
    end if;

    insert into public.staff (user_id, display_name, username, role, last_signed_in_at)
    values (v_sub, v_name, v_username, v_role, now())
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          username = excluded.username,
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
  'Creates or refreshes the calling staff member''s own row from the minted token. The first row ever is the owner; after that a new row takes the role of the invite claimed for its username, else staff. Spec 0004 (revised), widened by spec 0010.';

revoke execute on function public.ensure_staff() from public, anon;
grant execute on function public.ensure_staff() to authenticated;
