-- Spec 0010, AC-9: `public.acknowledge_privacy_notice` broke the moment spec
-- 0012 added `public.staff.version` (20260917145112). The function's `version`
-- parameter and that new column share one name, so the bare `version` in
-- `set privacy_acknowledged_version = version` is ambiguous. Postgres raises
-- 42702 on every call, the update never runs, and no staff member can clear
-- the privacy notice dialog.
--
-- The fix renames the parameter to `p_version`, the `p_` convention spec 0012
-- introduced for `update_staff_role()`. A rename changes the parameter name,
-- which `create or replace` cannot do, so the function is dropped and
-- recreated whole. The body is unchanged apart from that name, and the comment
-- and both grants are restated for the same reason the earlier migrations
-- flag: a missed grant here breaks the acknowledgement for every staff member
-- at once.
drop function public.acknowledge_privacy_notice(text);

create function public.acknowledge_privacy_notice(p_version text)
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

  update public.staff
     set privacy_acknowledged_at = now(),
         privacy_acknowledged_version = p_version
   where clerk_user_id = v_sub
  returning privacy_acknowledged_version into v_stored;

  if v_stored is null then
    raise no_data_found
      using message = 'no staff row for this caller';
  end if;

  return v_stored;
end;
$$;

comment on function public.acknowledge_privacy_notice(text) is
  'Records that the calling staff member has seen the given privacy notice version. Spec 0010, AC-9.';

revoke execute on function public.acknowledge_privacy_notice(text) from public, anon;
grant execute on function public.acknowledge_privacy_notice(text) to authenticated;
