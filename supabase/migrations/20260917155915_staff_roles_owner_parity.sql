-- Spec 0012 revision: owner stands equal to superadmin, including the one
-- capability that used to be superadmin only, managing everyone's role.
--
-- Widens update_staff_role()'s own check from "caller is superadmin" to
-- "caller is owner or superadmin". Nothing else about the function changes:
-- the self lockout guard, the owner transfer, the version check and the
-- audit inserts are untouched. owner keeps its own single row cap
-- (staff_single_owner_idx, unchanged); superadmin keeps its two person cap,
-- enforced in the screen, also unchanged.

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
      and s.role in ('owner', 'superadmin')
  ) then
    raise insufficient_privilege
      using message = 'Only an owner or superadmin may change a staff member''s role or active flag.';
  end if;

  -- AC-7: refused regardless of what the calling client's own UI already
  -- hides (AC-3 disables this case there; this is the enforcement point).
  if p_clerk_user_id = v_caller then
    raise insufficient_privilege
      using message = 'You cannot change your own role or active flag.';
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
  'The only way a staff member''s role or active flag changes. Owner or superadmin only, refuses the caller''s own row, demotes a previous owner in the same transaction as a transfer. Spec 0012, revised to give owner the same power as superadmin.';
