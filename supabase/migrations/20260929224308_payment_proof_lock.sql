-- Spec 0015, AC-20 and invariant 3b: a proof can be written only at a path a
-- booking was issued, and only until that booking is submitted.
--
-- The storage policies from the thin thread say exactly that, but Storage
-- checks them when it signs an upload URL, not when the upload arrives: a
-- signed URL lives for Supabase's fixed 2 hours, and an upload through it is
-- written with Storage's own rights. Proven on the linked project: a PUT to
-- the signed URL after `submit_online_booking` replaced the screenshot staff
-- are meant to check. This trigger holds the rule at the write itself, on
-- every path into the bucket, whoever is writing.
--
-- Deletes are untouched, so the proof purge (build plan task 7) still works.

create or replace function private.guard_payment_proof_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bucket_id = 'payment-proof' and not private.is_open_proof_path(new.name) then
    raise exception 'payment proof % is not open for upload', new.name
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_payment_proof_write() from public, anon, authenticated;

create trigger guard_payment_proof_write
  before insert or update on storage.objects
  for each row execute function private.guard_payment_proof_write();
