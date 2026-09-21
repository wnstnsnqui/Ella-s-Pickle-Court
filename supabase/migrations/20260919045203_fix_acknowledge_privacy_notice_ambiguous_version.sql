-- Fixes acknowledge_privacy_notice() failing with "42702: column reference
-- "version" is ambiguous" on every call.
--
-- 20260917145112_staff_roles_admin_access.sql added an integer `version`
-- column to public.staff for optimistic concurrency on role changes. This
-- function's parameter was already named `version` (text, the privacy notice
-- date), so `set privacy_acknowledged_version = version` in the UPDATE below
-- became ambiguous the moment that column existed: Postgres cannot tell
-- whether the bare identifier refers to the PL/pgSQL parameter or the table
-- column. Every call has raised a hard SQL error since, not the no_data_found
-- race 20260918113255 addressed, which is why that fix alone did not help: a
-- signed in staff member with a mismatched privacy_acknowledged_version hits
-- this every time, deterministically, including brand new staff. The owner's
-- own account never re-runs this path because its stored version already
-- matched before the staff.version column existed, which is why this stayed
-- unnoticed against a real account.
--
-- Renaming the parameter to `p_version`, the same convention already used by
-- update_staff_role(p_version integer), changes the signature's parameter
-- name, which Postgres will not let `create or replace` do (the error is
-- explicit about it), so the function is dropped and recreated. Every grant
-- below is restated for that reason, same as 20260916022657's own note on
-- ensure_staff().
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

  perform public.ensure_staff();

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
  'Records that the calling staff member has seen the given privacy notice version. Calls ensure_staff() first so a brand new staff row cannot lose the race against this write. Parameter is p_version, not version, because public.staff carries its own version column since spec 0012. Spec 0010, AC-9.';
revoke execute on function public.acknowledge_privacy_notice(text) from public, anon;
grant execute on function public.acknowledge_privacy_notice(text) to authenticated;
