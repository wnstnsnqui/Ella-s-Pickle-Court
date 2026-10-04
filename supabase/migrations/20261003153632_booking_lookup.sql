-- Spec 0017: a player looks up their booking by its code.
--
-- Nothing new becomes public. The read happens through
-- `lookup_online_booking`, which only the `booking_lookup` role may run, and
-- the only way to be that role is a 60 second token the server mints in
-- `lib/booking/actions.ts`. The function holds the miss limit, finds the
-- booking, decides which view the player reads, and masks the contact
-- details, so the full name, phone and email never leave Postgres on this
-- path (AC-4, AC-18).

-- ---------------------------------------------------------------------------
-- booking_lookup_miss: one row per wrong code, per connection (AC-10)
-- ---------------------------------------------------------------------------

-- No foreign key and no column that names a booking, on purpose: a miss is
-- only ever a count. Deleted after a day by the nightly purge (AC-19).
create table public.booking_lookup_miss (
  id          bigint generated always as identity primary key,
  client_hash text not null,
  created_at  timestamptz not null default now()
);

comment on table public.booking_lookup_miss is
  'One row per booking code that matched nothing, keyed by the HMAC of the caller''s address. Written only by lookup_online_booking; counted for its 5 per 15 minutes limit; deleted after a day. No grant to anybody. Spec 0017, AC-10.';

-- The limit's lookup: this caller's misses in the last 15 minutes.
create index booking_lookup_miss_client_hash_created_at_idx
  on public.booking_lookup_miss (client_hash, created_at);

alter table public.booking_lookup_miss enable row level security;

-- New tables in `public` arrive with full privileges for anon and
-- authenticated on this project, so the whole default goes first. No policy:
-- only the security definer function below ever touches the table.
revoke all on public.booking_lookup_miss from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The booking_lookup role
-- ---------------------------------------------------------------------------

-- `nologin`, like `online_booking`: PostgREST switches to it from
-- `authenticator` when the server's minted token says `role: booking_lookup`.
-- It can run one function and nothing else.
create role booking_lookup nologin nobypassrls;

comment on role booking_lookup is
  'The public read path for a booking code. Reached only through a 60 second token lib/supabase/staff-token.ts mints for lib/booking/actions.ts. Executes lookup_online_booking; nothing else. Spec 0017.';

grant booking_lookup to authenticator;
-- So the database tests can `set role` to it.
grant booking_lookup to postgres;

grant usage on schema public to booking_lookup;

-- ---------------------------------------------------------------------------
-- lookup_online_booking (AC-3 to AC-10, AC-18)
-- ---------------------------------------------------------------------------

-- Answers `{ ok: true, view, ... }` or `{ ok: false, reason, ... }`, never an
-- exception for a business refusal. The words the player reads are mapped in
-- TypeScript from the codes here, so copy changes need no migration.
create or replace function public.lookup_online_booking(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client_hash text := nullif(auth.jwt() ->> 'client_hash', '');
  v_now timestamptz := now();
  v_recent integer;
  v_oldest timestamptz;
  v_booking public.booking;
  v_use_active boolean;
  v_latest timestamptz;
  v_last_start timestamptz;
  v_last_end timestamptz;
  v_runs jsonb;
  v_view text;
  v_reason text;
begin
  -- Only a token the server minted carries this claim. Without it the limit
  -- has nothing to count, so refuse outright.
  if v_client_hash is null then
    raise exception 'lookup_online_booking needs the client_hash claim'
      using errcode = '42501';
  end if;

  -- AC-10: 5 misses per client in any 15 minutes. The lock makes the count
  -- and the insert one step per client, so parallel guesses cannot each see 4.
  -- Namespaced apart from the hold's 'online_booking:' key.
  perform pg_advisory_xact_lock(hashtextextended('booking_lookup:' || v_client_hash, 0));

  select count(*), min(m.created_at)
    into v_recent, v_oldest
    from public.booking_lookup_miss m
   where m.client_hash = v_client_hash
     and m.created_at > v_now - interval '15 minutes';

  -- While limited every code is refused, a right one too, so the limit never
  -- says whether a code exists (invariant 2).
  if v_recent >= 5 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'rate_limited',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_oldest + interval '15 minutes' - v_now))))::integer
    );
  end if;

  -- AC-8: a code the player never saw (no `submitted_at`) is found by the same
  -- one row read as an unknown code, and answers the same way.
  select * into v_booking
    from public.booking b
   where b.code = p_code
     and b.submitted_at is not null;

  v_view := case
    when not found then null
    when v_booking.status in ('pending_check', 'confirmed') then 'confirmed'
    when v_booking.status in ('rejected', 'cancelled') then 'cancelled'
    when v_booking.status = 'expired' then 'not_booked'
  end;

  if v_view is null then
    insert into public.booking_lookup_miss (client_hash) values (v_client_hash);
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- The rows that stand for the booking (spec 0016's rule): its active rows
  -- while it stands, otherwise the rows of its last insert batch, so a
  -- retake's rows win over the first hold's.
  v_use_active := v_booking.status in ('pending_check', 'confirmed')
    and exists (
      select 1 from public.reservation r
       where r.booking_id = v_booking.id and r.status = 'active'
    );

  select max(r.created_at) into v_latest
    from public.reservation r
   where r.booking_id = v_booking.id;

  -- AC-9: the last slot, and the start of the run it belongs to. The day the
  -- player reads comes from that start, never the end, so a run ending at
  -- midnight still names its own day.
  select r.starts_at, r.ends_at
    into v_last_start, v_last_end
    from public.reservation r
   where r.booking_id = v_booking.id
     and ((v_use_active and r.status = 'active')
          or (not v_use_active and r.created_at = v_latest))
   order by r.ends_at desc, r.starts_at desc
   limit 1;

  -- LOOKUP_DAYS_AFTER_LAST_SLOT (30), mirrored in lib/booking/constants.ts.
  if v_last_end is not null and v_last_end < v_now - interval '30 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'ended',
      -- The last run's start: the player reads only its day.
      'ended_at', v_last_start
    );
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'court_id', r.court_id,
               'court_name', c.name,
               'starts_at', r.starts_at,
               'ends_at', r.ends_at,
               'amount', r.amount
             )
             order by r.starts_at, r.court_id
           ),
           '[]'::jsonb
         )
    into v_runs
    from public.reservation r
    join public.court c on c.id = r.court_id
   where r.booking_id = v_booking.id
     and ((v_use_active and r.status = 'active')
          or (not v_use_active and r.created_at = v_latest));

  -- AC-5: the reason code only, never the staff note.
  if v_view = 'cancelled' then
    select e.reason into v_reason
      from public.booking_event e
     where e.booking_id = v_booking.id
       and e.kind in ('rejected', 'cancelled')
     order by e.created_at desc, e.id desc
     limit 1;
  end if;

  -- AC-18: exactly these keys. No booking id, full name, phone, email,
  -- reference digits, proof path, client hash, staff name or note.
  return jsonb_build_object(
    'ok', true,
    'view', v_view,
    'code', v_booking.code,
    'reason', v_reason,
    'refund_status', v_booking.refund_status,
    'refund_amount', v_booking.refund_amount,
    'refunded_at', v_booking.refunded_at,
    -- AC-4: masked here, so the unmasked contact never crosses into Node.
    'first_name', substring(v_booking.customer_name from '\S+'),
    'phone_last4', right(v_booking.customer_phone, 4),
    'email_masked',
      case when v_booking.customer_email is not null then
        left(split_part(v_booking.customer_email, '@', 1), 1) || '•••@'
          || split_part(v_booking.customer_email, '@', 2)
      end,
    'amount', v_booking.amount,
    'submitted_at', v_booking.submitted_at,
    'runs', v_runs
  );
end;
$$;

comment on function public.lookup_online_booking(text) is
  'Finds a submitted booking by its code for the player holding it: the view (confirmed, cancelled, not_booked), the runs, the refund, and the contact masked. Counts misses, 5 per client hash in 15 minutes. Executable by booking_lookup only. Spec 0017.';

-- Invariant 4 and AC-18: the function belongs to `booking_lookup` alone.
revoke execute on function public.lookup_online_booking(text) from public, anon, authenticated;
grant execute on function public.lookup_online_booking(text) to booking_lookup;

-- ---------------------------------------------------------------------------
-- Retention (AC-19)
-- ---------------------------------------------------------------------------

-- Restated from 20261002163856_online_checks_retention.sql with one change:
-- the misses go after CLIENT_HASH_RETENTION_DAYS (1), like the booking's own
-- client hash. Every other number is as it was.
create or replace function public.purge_online_booking_details()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_details integer;
  v_notes   integer;
  v_hashes  integer;
  v_misses  integer;
begin
  -- EMAIL_RETENTION_DAYS, REFERENCE_RETENTION_DAYS and PHONE_RETENTION_DAYS,
  -- all 90, counted from the end of the booking's last slot (any status: an
  -- expired booking's rows are cancelled but still say when it would have ended).
  with last_end as (
    select r.booking_id, max(r.ends_at) as ends_at
      from public.reservation r
     where r.booking_id is not null
     group by r.booking_id
  )
  update public.booking b
     set customer_phone = null,
         customer_email = null,
         reference_last4 = null,
         version = b.version + 1,
         changed_by = null
    from last_end l
   where l.booking_id = b.id
     and l.ends_at < now() - interval '90 days'
     and (b.customer_phone is not null
          or b.customer_email is not null
          or b.reference_last4 is not null);
  get diagnostics v_details = row_count;

  -- The staff notes on its decisions, at the same age (spec 0016, AC-18).
  with last_end as (
    select r.booking_id, max(r.ends_at) as ends_at
      from public.reservation r
     where r.booking_id is not null
     group by r.booking_id
  )
  update public.booking_event e
     set note = null
    from last_end l
   where l.booking_id = e.booking_id
     and l.ends_at < now() - interval '90 days'
     and e.note is not null;
  get diagnostics v_notes = row_count;

  -- CLIENT_HASH_RETENTION_DAYS, 1. The rate limit only ever looks back 15
  -- minutes, so clearing it a day on changes no answer.
  update public.booking
     set client_hash = null,
         version = version + 1,
         changed_by = null
   where client_hash is not null
     and created_at < now() - interval '1 day';
  get diagnostics v_hashes = row_count;

  -- The lookup's misses, at the same age (spec 0017, AC-19).
  delete from public.booking_lookup_miss
   where created_at < now() - interval '1 day';
  get diagnostics v_misses = row_count;

  return v_details + v_notes + v_hashes + v_misses;
end;
$$;
