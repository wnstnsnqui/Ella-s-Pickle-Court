-- Spec 0015, build plan task 1: the thin thread of online booking.
--
-- The first time the public writes to this database. Nothing new becomes
-- public: the write happens through `hold_online_booking`, which only the
-- `online_booking` role may run, and the only way to be that role is a 60
-- second token the server mints after its own checks (Turnstile, Zod, the
-- client hash). Everything that matters (the slots, the hours, the price, the
-- overlaps, the rate limit) is decided here, never trusted from the caller.
--
-- A hold is a real booking: its reservation rows are `active`, so both boards
-- read the slots Booked through the ordinary broadcast, and
-- `reservation_no_overlap` stops a second hold exactly as it stops a second
-- desk booking (invariant 1). `submit_online_booking`, `release_online_booking`
-- and the expiry job land with build plan tasks 3 and 4.

-- ---------------------------------------------------------------------------
-- The price, in one place the server enforces (AC-17)
-- ---------------------------------------------------------------------------

alter table public.venue_settings
  add column hourly_rate numeric(10, 2) not null default 250,
  add constraint venue_settings_hourly_rate_check check (hourly_rate > 0);

comment on column public.venue_settings.hourly_rate is
  'Pesos per court per hour. The only price anything charges: hold_online_booking reads it, and the landing page shows it. Spec 0015, AC-17.';

-- ---------------------------------------------------------------------------
-- booking: one row per booking, the header its reservation rows share
-- ---------------------------------------------------------------------------

create table public.booking (
  id                bigint generated always as identity primary key,
  code              text not null,
  source            text not null default 'online',
  status            text not null,
  customer_name     text not null,
  -- Required by the hold function, nullable so the retention purge can clear it.
  customer_phone    text,
  customer_email    text,
  reference_last4   text,
  -- Fixed by the hold, before any upload, so the purge can find a screenshot
  -- that was never confirmed (invariant 3b). Null once the proof is deleted.
  proof_path        text,
  amount            numeric(10, 2) not null,
  hourly_rate       numeric(10, 2) not null,
  -- Kept after the hold ends, as a record of when it would have ended.
  hold_expires_at   timestamptz,
  terms_version     text not null,
  terms_accepted_at timestamptz not null,
  submission_id     uuid not null,
  submitted_at      timestamptz,
  -- HMAC of the caller's address, for the rate limit. Cleared after a day.
  client_hash       text,
  decided_at        timestamptz,
  decided_by        text references public.staff (user_id),
  version           integer not null default 1,
  changed_by        text references public.staff (user_id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint booking_code_key unique (code),
  constraint booking_submission_id_key unique (submission_id),
  constraint booking_proof_path_key unique (proof_path),
  -- AC-18: 8 characters from 23456789ABCDEFGHJKMNPQRSTUVWXYZ, stored without the dash.
  constraint booking_code_check check (code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  constraint booking_source_check check (source in ('online', 'desk')),
  constraint booking_status_check
    check (status in ('held', 'pending_check', 'confirmed', 'rejected', 'expired', 'cancelled')),
  constraint booking_customer_name_check check (length(btrim(customer_name)) between 1 and 80),
  constraint booking_customer_phone_check
    check (customer_phone is null or customer_phone ~ '^\+639[0-9]{9}$'),
  constraint booking_customer_email_check
    check (customer_email is null or (length(customer_email) <= 254 and customer_email ~ '^[^@\s]+@[^@\s]+$')),
  constraint booking_reference_last4_check
    check (reference_last4 is null or reference_last4 ~ '^[0-9]{4}$'),
  constraint booking_proof_path_check check (proof_path is null or length(proof_path) <= 200),
  constraint booking_amount_check check (amount >= 0),
  constraint booking_hourly_rate_check check (hourly_rate > 0),
  constraint booking_terms_version_check check (length(terms_version) between 1 and 40),
  -- Invariant 3, both one way: a held booking always knows when its hold
  -- ends, and a submitted one always knows when it was submitted.
  constraint booking_held_expiry_check check (status <> 'held' or hold_expires_at is not null),
  constraint booking_submitted_check
    check (status not in ('pending_check', 'confirmed', 'rejected') or submitted_at is not null)
);

comment on table public.booking is
  'One booking, online or (later) desk, and the header its reservation rows share through reservation.booking_id. No anon grant; written only by the online booking functions. Spec 0015.';

-- The rate limit's lookup: this caller's bookings in the last 15 minutes.
create index booking_client_hash_created_at_idx on public.booking (client_hash, created_at);
-- The expiry job's lookup: held bookings past their time.
create index booking_held_expiry_idx on public.booking (status, hold_expires_at)
  where status = 'held';
create index booking_decided_by_idx on public.booking (decided_by);
create index booking_changed_by_idx on public.booking (changed_by);

create trigger booking_set_updated_at
  before update on public.booking
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reservation.booking_id: one booking, one or more rows
-- ---------------------------------------------------------------------------

-- Online rows still copy the name and phone, so every existing read, the
-- phone purge and the reports work unchanged. anon's four column grant does
-- not include this column, so the public board never learns which rows share
-- a booking.
alter table public.reservation
  add column booking_id bigint references public.booking (id);

create index reservation_booking_id_idx on public.reservation (booking_id);

-- ---------------------------------------------------------------------------
-- Grants and policies on booking
-- ---------------------------------------------------------------------------

alter table public.booking enable row level security;

-- New tables in `public` arrive with full privileges for anon and
-- authenticated on this project, so the whole default goes first. Invariant 6:
-- anon has no path to `booking` at all.
revoke all on public.booking from public, anon, authenticated;
grant select on public.booking to authenticated;

-- Staff read a booking to see its code, email and reference digits (AC-21).
-- No staff write policy in this feature; feature 17 adds one.
create policy "active staff may read every booking"
  on public.booking for select to authenticated
  using ((select private.is_active_staff()));

-- ---------------------------------------------------------------------------
-- The online_booking role
-- ---------------------------------------------------------------------------

-- `nologin`: nobody connects as this role. PostgREST and Storage switch to it
-- from `authenticator` when the server's minted token says `role:
-- online_booking`, and it can do exactly two things: run the online booking
-- functions, and write the one proof object a booking was issued.
create role online_booking nologin nobypassrls;

comment on role online_booking is
  'The public write path for online booking. Reached only through a 60 second token lib/supabase/staff-token.ts mints after Turnstile. Executes the online booking functions and writes one proof object per booking; nothing else. Spec 0015.';

-- The API switches to this role from `authenticator`; Storage reaches it the
-- same way, because `supabase_storage_admin` is a member of `authenticator`.
grant online_booking to authenticator;
-- So the migration role and the database tests can `set role` to it (the same
-- reason `better_auth_app` is granted to postgres).
grant online_booking to postgres;

grant usage on schema public to online_booking;

-- ---------------------------------------------------------------------------
-- The payment proof bucket (AC-9, AC-20)
-- ---------------------------------------------------------------------------

-- Private: no public URL ever reaches an object here. The browser uploads the
-- shrunk screenshot, so 10 MB is a ceiling, not a target.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proof', 'payment-proof', false, 10485760, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Whether an object name is the proof path a booking was issued and has not
-- yet been submitted with. Security definer so the storage policies can ask
-- without `online_booking` holding any grant on `booking`.
create or replace function private.is_open_proof_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.booking b
    where b.proof_path = object_name
      and b.submitted_at is null
  );
$$;

revoke execute on function private.is_open_proof_path(text) from public, anon, authenticated;
grant usage on schema private to online_booking;
grant execute on function private.is_open_proof_path(text) to online_booking;

grant usage on schema storage to online_booking;
-- An upsert needs all three: insert for the first upload, select and update
-- for Replace and Retry overwriting the same path.
grant select, insert, update on storage.objects to online_booking;

create policy "online booking may add its own proof"
  on storage.objects for insert to online_booking
  with check (bucket_id = 'payment-proof' and private.is_open_proof_path(name));

create policy "online booking may read back its own proof"
  on storage.objects for select to online_booking
  using (bucket_id = 'payment-proof' and private.is_open_proof_path(name));

create policy "online booking may replace its own proof"
  on storage.objects for update to online_booking
  using (bucket_id = 'payment-proof' and private.is_open_proof_path(name))
  with check (bucket_id = 'payment-proof' and private.is_open_proof_path(name));

-- ---------------------------------------------------------------------------
-- Helpers, in the schema nothing is exposed from
-- ---------------------------------------------------------------------------

-- AC-18: 8 characters from a 31 character alphabet with no 0, 1, I, L or O,
-- drawn from `gen_random_bytes`. A byte is kept only below 248 (8 times 31),
-- so every character is equally likely.
create or replace function private.new_booking_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  code text := '';
  b integer;
  i integer;
begin
  while length(code) < 8 loop
    bytes := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      b := get_byte(bytes, i);
      if b < 248 then
        code := code || substr(alphabet, (b % 31) + 1, 1);
        exit when length(code) = 8;
      end if;
    end loop;
  end loop;
  return code;
end;
$$;

revoke execute on function private.new_booking_code() from public, anon, authenticated;

-- Ends a held booking: the booking reads `expired` and its rows are
-- cancelled, so the slots free on both boards at once. `changed_by` stays
-- null, so `cancelled_by` does too, and the report's day list can tell a
-- system cancel from a staff one (AC-16). `hold_expires_at` is never touched.
create or replace function private.expire_online_booking(p_booking_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.booking
     set status = 'expired',
         version = version + 1,
         changed_by = null
   where id = p_booking_id
     and status = 'held';

  update public.reservation
     set status = 'cancelled',
         version = version + 1,
         changed_by = null
   where booking_id = p_booking_id
     and status = 'active';
end;
$$;

revoke execute on function private.expire_online_booking(bigint) from public, anon, authenticated;

-- What every online booking function answers with on success: the booking as
-- the player may see it. Runs are the active rows, or for a booking that has
-- none left, the slots it last held.
create or replace function private.online_booking_result(p_booking_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'booking_id', b.id,
    'code', b.code,
    'status', b.status,
    'proof_path', b.proof_path,
    'hold_expires_at', b.hold_expires_at,
    'server_now', now(),
    'amount', b.amount,
    'hourly_rate', b.hourly_rate,
    'customer', jsonb_build_object(
      'name', b.customer_name,
      'phone', b.customer_phone,
      'email', b.customer_email
    ),
    'reference_last4', b.reference_last4,
    'submitted_at', b.submitted_at,
    'runs', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'court_id', r.court_id,
                 'starts_at', r.starts_at,
                 'ends_at', r.ends_at,
                 'amount', r.amount
               )
               order by r.starts_at, r.court_id
             )
        from (
          select distinct on (x.court_id, x.starts_at) x.court_id, x.starts_at, x.ends_at, x.amount
            from public.reservation x
           where x.booking_id = b.id
           order by x.court_id, x.starts_at, (x.status = 'active') desc, x.id desc
        ) r
    ), '[]'::jsonb)
  )
  from public.booking b
  where b.id = p_booking_id;
$$;

revoke execute on function private.online_booking_result(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- hold_online_booking (AC-4, AC-5, AC-6, AC-7, AC-16, AC-17, AC-18, AC-19)
-- ---------------------------------------------------------------------------

-- Every business refusal is an answer, `{ ok: false, reason, ... }`, never an
-- exception; only a bug raises. The taken slots are found by a plain select
-- before anything is inserted, so the usual clash writes nothing, and every
-- insert sits inside one block that a race on `reservation_no_overlap` rolls
-- back whole (invariant 3a).
create or replace function public.hold_online_booking(
  p_submission_id uuid,
  p_day date,
  p_picks jsonb,
  p_name text,
  p_phone text,
  p_email text,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_hash text := nullif(auth.jwt() ->> 'client_hash', '');
  v_now timestamptz := now();
  v_name text := btrim(p_name);
  v_phone text := btrim(p_phone);
  v_email text := btrim(p_email);
  v_existing public.booking;
  v_booking_id bigint;
  v_settings public.venue_settings;
  v_slot interval;
  v_today date;
  v_open time;
  v_close time;
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_courts bigint[];
  v_starts timestamptz[];
  v_count integer;
  v_recent integer;
  v_oldest timestamptz;
  v_lapsed bigint;
  v_taken jsonb;
  v_amount numeric(10, 2);
  v_code text;
begin
  -- Only a token the server minted carries this claim. Without it the rate
  -- limit has nothing to count, so refuse outright.
  if v_client_hash is null then
    raise exception 'hold_online_booking needs the client_hash claim'
      using errcode = '42501';
  end if;

  if p_submission_id is null
     or p_day is null
     or v_name is null or length(v_name) not between 1 and 80
     or v_phone is null or v_phone !~ '^\+639[0-9]{9}$'
     or v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+$'
     or p_terms_version is null or length(p_terms_version) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- AC-5: the same sheet calling again (Back to Details, an edit, Next) edits
  -- the details in place. Same code, same expiry: the 5 minutes never restart,
  -- and no new booking counts against the rate limit. A hold that has lapsed
  -- is edited the same way; its Payment step already says the hold ended, and
  -- Confirm retakes the slots if they are still free (AC-10, AC-12).
  select * into v_existing
    from public.booking b
   where b.submission_id = p_submission_id
     for update;

  if found then
    if v_existing.submitted_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    update public.booking
       set customer_name = v_name,
           customer_phone = v_phone,
           customer_email = v_email,
           version = version + 1
     where id = v_existing.id;

    update public.reservation
       set customer_name = v_name,
           customer_phone = v_phone,
           version = version + 1
     where booking_id = v_existing.id
       and status = 'active';

    return private.online_booking_result(v_existing.id);
  end if;

  -- AC-19: five new holds per client in any 15 minutes. The lock serializes
  -- one client's holds so two at once cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('online_booking:' || v_client_hash, 0));

  select count(*), min(b.created_at)
    into v_recent, v_oldest
    from public.booking b
   where b.client_hash = v_client_hash
     and b.created_at > v_now - interval '15 minutes';

  if v_recent >= 5 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'rate_limited',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_oldest + interval '15 minutes' - v_now))))::integer
    );
  end if;

  -- The day, in the venue's own timezone and hours (AC-4).
  select * into v_settings from public.venue_settings s where s.id;
  v_slot := make_interval(mins => v_settings.slot_minutes);
  v_today := (v_now at time zone v_settings.timezone)::date;

  if p_day < v_today or p_day > v_today + v_settings.booking_horizon_days then
    return jsonb_build_object('ok', false, 'reason', 'out_of_range');
  end if;

  select h.open_time, h.close_time
    into v_open, v_close
    from public.venue_hours h
   where h.day_of_week = extract(dow from p_day);

  if v_open is null then
    return jsonb_build_object('ok', false, 'reason', 'out_of_range');
  end if;

  -- `date + time '24:00'` is the next midnight, so a close at midnight is a
  -- real end, never the start of the same day.
  v_open_at := (p_day + v_open) at time zone v_settings.timezone;
  v_close_at := (p_day + v_close) at time zone v_settings.timezone;

  -- The picks, sorted by court then time.
  if jsonb_typeof(p_picks) is distinct from 'array'
     or jsonb_array_length(p_picks) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select array_agg(p.court_id order by p.court_id, p.starts_at),
         array_agg(p.starts_at order by p.court_id, p.starts_at),
         count(distinct (p.court_id, p.starts_at))
    into v_courts, v_starts, v_count
    from jsonb_to_recordset(p_picks) as p(court_id bigint, starts_at timestamptz);

  if v_count <> jsonb_array_length(p_picks)
     or array_position(v_courts, null) is not null
     or array_position(v_starts, null) is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Every pick: a live court, a slot the grid would draw on this day, and a
  -- start still ahead of now. One bad pick refuses the lot.
  if exists (
    select 1
      from unnest(v_courts, v_starts) as p(court_id, starts_at)
     where not exists (
             select 1 from public.court c where c.id = p.court_id and c.retired_at is null
           )
        or p.starts_at < v_open_at
        or p.starts_at + v_slot > v_close_at
        or extract(epoch from (p.starts_at - v_open_at)) % (v_settings.slot_minutes * 60) <> 0
        or p.starts_at <= v_now
  ) then
    return jsonb_build_object('ok', false, 'reason', 'out_of_range');
  end if;

  -- AC-16: a lapsed hold the minute job has not reached yet never blocks a
  -- new one. Only holds overlapping these picks are ended here.
  for v_lapsed in
    select distinct b.id
      from public.booking b
      join public.reservation r on r.booking_id = b.id and r.status = 'active'
      join unnest(v_courts, v_starts) as p(court_id, starts_at)
        on r.court_id = p.court_id
       and r.during && tstzrange(p.starts_at, p.starts_at + v_slot, '[)')
     where b.status = 'held'
       and b.hold_expires_at <= v_now
  loop
    perform private.expire_online_booking(v_lapsed);
  end loop;

  -- AC-6: name every pick somebody already holds, and write nothing.
  select private.taken_picks(v_courts, v_starts, v_slot) into v_taken;
  if jsonb_array_length(v_taken) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken', 'slots', v_taken);
  end if;

  -- AC-17: the price is never an input. Tiles times hours per tile times the
  -- rate read now; a later rate change leaves this booking's amount alone.
  v_amount := cardinality(v_starts) * (v_settings.slot_minutes / 60.0) * v_settings.hourly_rate;

  loop
    v_code := private.new_booking_code();
    exit when not exists (select 1 from public.booking b where b.code = v_code);
  end loop;

  begin
    insert into public.booking (
      code, status, customer_name, customer_phone, customer_email,
      amount, hourly_rate, hold_expires_at, terms_version, terms_accepted_at,
      submission_id, client_hash
    )
    values (
      v_code, 'held', v_name, v_phone, v_email,
      v_amount, v_settings.hourly_rate, v_now + interval '5 minutes', p_terms_version, v_now,
      p_submission_id, v_client_hash
    )
    returning id into v_booking_id;

    -- Invariant 3b: the database names the one path this booking may upload
    -- to. No extension; the content type travels with the object.
    update public.booking
       set proof_path = v_booking_id::text || '/' || p_submission_id::text
     where id = v_booking_id;

    -- One row per run of adjacent picks on a court, as the desk books them.
    -- Each run carries its own share, and the shares add up to the amount.
    insert into public.reservation (
      court_id, kind, status, starts_at, ends_at, customer_name, customer_phone,
      payment_status, amount, created_by, changed_by, booking_id
    )
    select run.court_id, 'booking', 'active', run.starts_at, run.ends_at, v_name, v_phone,
           'unpaid',
           run.tiles * (v_settings.slot_minutes / 60.0) * v_settings.hourly_rate,
           null, null, v_booking_id
      from (
        select g.court_id,
               min(g.starts_at) as starts_at,
               max(g.starts_at) + v_slot as ends_at,
               count(*) as tiles
          from (
            select p.court_id,
                   p.starts_at,
                   p.starts_at - v_slot * row_number() over (
                     partition by p.court_id order by p.starts_at
                   ) as island
              from unnest(v_courts, v_starts) as p(court_id, starts_at)
          ) g
         group by g.court_id, g.island
      ) run;
  exception when exclusion_violation then
    -- Somebody took a slot between the check and the insert. The block has
    -- rolled back whole; look again to name what they took.
    return jsonb_build_object(
      'ok', false,
      'reason', 'slot_taken',
      'slots', private.taken_picks(v_courts, v_starts, v_slot)
    );
  end;

  return private.online_booking_result(v_booking_id);
end;
$$;

comment on function public.hold_online_booking(uuid, date, jsonb, text, text, text, text) is
  'Holds the picked slots for 5 minutes as one online booking, or updates the same submission''s details in place. Price, code, hours and the rate limit are all decided here. Executable by online_booking only. Spec 0015, AC-4.';

-- The picks somebody already holds, as `[{ court_id, starts_at }]`.
create or replace function private.taken_picks(
  p_courts bigint[],
  p_starts timestamptz[],
  p_slot interval
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('court_id', p.court_id, 'starts_at', p.starts_at)
      order by p.starts_at, p.court_id
    ),
    '[]'::jsonb
  )
  from unnest(p_courts, p_starts) as p(court_id, starts_at)
  where exists (
    select 1
      from public.reservation r
     where r.status = 'active'
       and r.court_id = p.court_id
       and r.during && tstzrange(p.starts_at, p.starts_at + p_slot, '[)')
  );
$$;

revoke execute on function private.taken_picks(bigint[], timestamptz[], interval)
  from public, anon, authenticated;

-- Invariant 6: the online booking functions belong to `online_booking` alone.
revoke execute on function public.hold_online_booking(uuid, date, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.hold_online_booking(uuid, date, jsonb, text, text, text, text)
  to online_booking;
