/**
 * What the online booking database tests share (spec 0015). Not a test file:
 * the SQL pieces that pick real bookable slots and speak as `online_booking`.
 *
 * The slots are chosen inside the batch, so the tests follow the linked
 * project's own hours, horizon and courts: the farthest open day in the booking
 * window whose first two slots are free on the first two live courts. Nothing
 * is hardcoded that Ella could change.
 */

/** The client hash every case holds under, so the rate limit counts only test rows. */
export const TEST_CLIENT_HASH = "online-booking-db-test";

/**
 * Sets `test.day`, `test.court1`, `test.court2`, `test.slot1`, `test.slot2`
 * (the first two slots of that day), and `test.picks`: two adjacent slots on
 * court 1 and the first on court 2, so a hold makes two runs from three tiles.
 */
export const PICK_SLOTS = `
with s as (select * from public.venue_settings where id),
courts as (
  select array_agg(id order by id) as ids
    from (select id from public.court where retired_at is null order by id limit 2) c
),
open_day as (
  select d.day,
         (d.day + h.open_time) at time zone s.timezone as open_at,
         make_interval(mins => s.slot_minutes) as slot
    from s
   cross join lateral (
     select (now() at time zone s.timezone)::date + g as day
       from generate_series(1, s.booking_horizon_days) g
   ) d
    join public.venue_hours h on h.day_of_week = extract(dow from d.day)
   cross join courts
   where h.open_time is not null
     and not exists (
       select 1 from public.reservation r
        where r.status = 'active'
          and r.court_id = any (courts.ids)
          and r.during && tstzrange(
            (d.day + h.open_time) at time zone s.timezone,
            (d.day + h.open_time) at time zone s.timezone + make_interval(mins => s.slot_minutes * 2),
            '[)')
     )
   order by d.day desc
   limit 1
)
select set_config('test.day', o.day::text, true),
       set_config('test.court1', c.ids[1]::text, true),
       set_config('test.court2', c.ids[2]::text, true),
       set_config('test.slot1', o.open_at::text, true),
       set_config('test.slot2', (o.open_at + o.slot)::text, true),
       set_config('test.picks', jsonb_build_array(
         jsonb_build_object('court_id', c.ids[1], 'starts_at', o.open_at),
         jsonb_build_object('court_id', c.ids[1], 'starts_at', o.open_at + o.slot),
         jsonb_build_object('court_id', c.ids[2], 'starts_at', o.open_at)
       )::text, true)
  from open_day o, courts c;
`;

/** Speak as the minted `online_booking` token until `reset role`. */
export function asOnlineBooking(clientHash: string = TEST_CLIENT_HASH): string {
  const claims = JSON.stringify({ role: "online_booking", client_hash: clientHash });
  return `set local role online_booking;
select set_config('request.jwt.claims', '${claims}', true);`;
}

/**
 * A `hold_online_booking` call on the chosen day, its answer kept in
 * `test.<key>` so it survives `reset role`. `picks` defaults to all three.
 */
export function hold(
  key: string,
  submission: string,
  {
    name = "Checkout Test",
    phone = "+639171234567",
    picks = "current_setting('test.picks')::jsonb",
    day = "current_setting('test.day')::date",
  }: { name?: string; phone?: string; picks?: string; day?: string } = {},
): string {
  return `select set_config('test.${key}', public.hold_online_booking(
  '${submission}', ${day}, ${picks}, '${name}', '${phone}', 'test@example.com', 'test'
)::text, true);`;
}

/** Put a payment screenshot at the booking's issued path, as the signed upload would. */
export function uploadProof(submission: string): string {
  return `insert into storage.objects (bucket_id, name)
select 'payment-proof', b.proof_path from public.booking b where b.submission_id = '${submission}';`;
}
