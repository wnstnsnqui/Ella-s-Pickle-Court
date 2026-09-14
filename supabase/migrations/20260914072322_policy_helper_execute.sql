-- Spec 0002 fix: the policy helpers must be executable by the role whose
-- policies call them.
--
-- The court schedule migration revoked execute on private.is_active_staff()
-- and private.is_owner() from authenticated. A row level security policy runs
-- its expression as the caller, so every policy that calls either function
-- failed for a signed in staff member with "permission denied for function
-- is_active_staff", which refused every read and write on staff, court,
-- reservation and venue_settings. It stayed hidden until the staff board
-- (spec 0005) made the first signed in read.
--
-- Both functions are security definer and check the caller's own token, so
-- granting execute exposes nothing: authenticated may only ask "am I active
-- staff" and "am I the owner". anon stays revoked, as does usage on the
-- private schema, so neither function is reachable over the API by name.
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.is_owner() to authenticated;
