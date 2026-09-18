-- Spec 0012: admin and superadmin roles, and the one door that changes
-- anyone's role or active flag.
--
-- `staff.role` widens from two values to four. `private.is_owner()` widens in
-- place so every existing owner gated policy treats owner, admin and
-- superadmin alike, with no changes to the policies themselves. A new
-- function, `update_staff_role()`, is the only way to change someone's role
-- or active flag: restricted to superadmin, refusing a caller acting on their
-- own row, and demoting a previous owner in the same transaction as handing
-- the role to someone new. Every change it makes lands in `staff_audit`,
-- written explicitly inside the function, never by a trigger, so
-- `ensure_staff()`'s own per-page-load refresh never appears there.

-- ---------------------------------------------------------------------------
-- staff: the widened role, and the version every write to it now carries
-- ---------------------------------------------------------------------------

alter table public.staff
  drop constraint staff_role_check;
alter table public.staff
  add constraint staff_role_check check (role in ('staff', 'owner', 'admin', 'superadmin'));

alter table public.staff
  add column version integer not null default 1;

comment on column public.staff.version is
  'Bumped on every role or active change through public.update_staff_role(). Spec 0012.';

-- Invariant 3: at most one staff row ever holds role = 'owner'. A concurrent
-- double promotion fails this index rather than succeeding, the real,
-- database level half of the rule update_staff_role() also enforces below.
create unique index staff_single_owner_idx
  on public.staff (role)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- private.is_owner(): widened to pass for owner, admin and superadmin
-- ---------------------------------------------------------------------------

-- Every existing policy that calls this stays untouched: the widening happens
-- once, here, not at each of the eleven call sites that already key on it.
-- The name stays misleading now that it also passes for admin and
-- superadmin; a rename is a follow up, not a blocker. Spec 0012, AC-12.
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
    where s.clerk_user_id = (select auth.jwt() ->> 'sub')
      and s.is_active
      and s.role in ('owner', 'admin', 'superadmin')
  );
$$;

-- ---------------------------------------------------------------------------
-- staff_audit: mirrors reservation_audit's shape and hardening
-- ---------------------------------------------------------------------------

create table public.staff_audit (
  id         bigint generated always as identity primary key,
  -- Not a foreign key on purpose: the audit outlives the row it describes.
  staff_id   text not null,
  op         text not null,
  old_row    jsonb,
  new_row    jsonb,
  changed_by text,
  changed_at timestamptz not null default now(),
  constraint staff_audit_op_check check (op in ('update'))
);

comment on table public.staff_audit is
  'Every role or active change public.update_staff_role() makes. Written explicitly inside the function, never by a trigger, so ensure_staff()''s own per page load refresh never appears here. Spec 0012.';

create index staff_audit_staff_idx
  on public.staff_audit (staff_id, changed_at desc);

alter table public.staff_audit enable row level security;

-- A new table in this project is auto exposed to anon and authenticated with
-- full privileges (the reasoning tighten_grants.sql left behind), so this is
-- narrowed immediately rather than left for a later hardening pass, mirroring
-- reservation_audit exactly: staff read it, nobody writes it directly, and
-- anon has no route to it at all.
revoke delete on public.staff_audit from anon, authenticated;
revoke insert, update on public.staff_audit from anon, authenticated;
revoke select on public.staff_audit from anon;

grant select on public.staff_audit to authenticated;

create policy "active staff may read the staff audit trail"
  on public.staff_audit for select to authenticated
  using ((select private.is_active_staff()));

-- ---------------------------------------------------------------------------
-- update_staff_role(): the only way anyone's role or active flag changes
-- ---------------------------------------------------------------------------

-- `security definer` because `authenticated` has no update grant on `staff`
-- (spec 0002 tightened it away, and nothing here adds it back). `set
-- search_path = ''` so nothing on the caller's path can shadow the objects
-- named here. The superadmin check and the self lockout guard are inlined
-- rather than pulled into a shared helper, because this is the one place
-- either needs to exist (spec 0012, AC-6 and AC-7).
create or replace function public.update_staff_role(
  p_clerk_user_id text,
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
    where s.clerk_user_id = v_caller
      and s.is_active
      and s.role = 'superadmin'
  ) then
    raise insufficient_privilege
      using message = 'Only a superadmin may change a staff member''s role or active flag.';
  end if;

  -- AC-7: refused regardless of what the calling client's own UI already
  -- hides (AC-3 disables this case there; this is the enforcement point).
  if p_clerk_user_id = v_caller then
    raise insufficient_privilege
      using message = 'A superadmin cannot change their own role or active flag.';
  end if;

  -- AC-9: handing `owner` to a new row demotes whoever held it, in the same
  -- transaction as the target's own update below. staff_single_owner_idx is
  -- the real backstop if two transfers race.
  if p_role = 'owner' then
    select * into v_prior_owner
      from public.staff s
     where s.role = 'owner'
       and s.clerk_user_id <> p_clerk_user_id;

    if found then
      update public.staff s
         set role = 'admin',
             version = s.version + 1
       where s.clerk_user_id = v_prior_owner.clerk_user_id
      returning * into v_demoted;

      insert into public.staff_audit (staff_id, op, old_row, new_row, changed_by)
      values (v_prior_owner.clerk_user_id, 'update', to_jsonb(v_prior_owner), to_jsonb(v_demoted), v_caller);
    end if;
  end if;

  select * into v_old from public.staff s where s.clerk_user_id = p_clerk_user_id;

  update public.staff s
     set role = p_role,
         is_active = p_is_active,
         version = s.version + 1
   where s.clerk_user_id = p_clerk_user_id
     and s.version = p_version
  returning * into v_new;

  -- AC-8: a stale version and a target that no longer exists both touch zero
  -- rows here, and both are refused the same way reorder_courts already
  -- refuses either case.
  if not found then
    raise exception 'stale_version: staff % is not at version %',
      p_clerk_user_id, p_version
      using errcode = 'P0002';
  end if;

  insert into public.staff_audit (staff_id, op, old_row, new_row, changed_by)
  values (p_clerk_user_id, 'update', to_jsonb(v_old), to_jsonb(v_new), v_caller);

  return v_new;
end;
$$;

comment on function public.update_staff_role(text, text, boolean, integer) is
  'The only way a staff member''s role or active flag changes. Superadmin only, refuses the caller''s own row, demotes a previous owner in the same transaction as a transfer. Spec 0012.';

revoke execute on function public.update_staff_role(text, text, boolean, integer) from public, anon;
grant execute on function public.update_staff_role(text, text, boolean, integer) to authenticated;

-- Restated: this migration adds no update grant on `staff` for `anon` or
-- `authenticated`. update_staff_role() writes through `security definer`,
-- never through a grant a caller could otherwise use to touch another row.
