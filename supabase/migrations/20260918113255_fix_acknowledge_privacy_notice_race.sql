-- Fixes acknowledge_privacy_notice() failing with "no_data_found" for a
-- brand new staff member.
--
-- The privacy notice dialog can only open once currentStaff() has already
-- called ensure_staff() and returned an active row, so under ordinary
-- sequential navigation the staff row exists by the time Acknowledge is
-- clicked. But acknowledgePrivacyNotice() reaches the database through a
-- separate request (requireStaff() in lib/actions.ts only checks Clerk
-- auth, it never provisions the row), so it silently depends on that
-- earlier request having already committed. On a genuinely new Clerk
-- identity, ensure_staff()'s first sign in path (advisory lock + insert) is
-- slow enough that a fast Acknowledge click, or a stale render served
-- before that insert committed, can lose the race: the UPDATE here matches
-- zero rows and raises no_data_found.
--
-- Calling ensure_staff() first removes the cross request assumption: it is
-- idempotent (a plain update once the row exists), so this costs nothing
-- for the common case and guarantees the row exists before the update
-- below runs. Signature is unchanged, so `create or replace` keeps the
-- existing grants (see supabase/AGENTS.md).
create or replace function public.acknowledge_privacy_notice(version text)
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
         privacy_acknowledged_version = version
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
  'Records that the calling staff member has seen the given privacy notice version. Calls ensure_staff() first so a brand new staff row cannot lose the race against this write. Spec 0010, AC-9.';
