-- `create_staff_invite()` had no defaults, so a call that left out the
-- argument the kind does not use (`p_role` for a reset, `p_target_user_id`
-- for an invite) made PostgREST look for a three argument overload and fail
-- with "Could not find the function ... in the schema cache". Give both a
-- null default so either key may be omitted. Same argument types, so the
-- existing grants stay in place.
create or replace function public.create_staff_invite(
  p_kind text,
  p_role text default null,
  p_target_user_id text default null,
  p_token_hash text default null
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

  if p_token_hash is null then
    raise exception 'A link needs a token.'
      using errcode = '22023';
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
    if p_role is null then
      raise exception 'An invite needs a role.'
        using errcode = '22023';
    end if;
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
