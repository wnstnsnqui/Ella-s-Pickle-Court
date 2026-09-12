-- Everything `supabase db advisors` raised against the court schedule migration.
-- Kept as its own forward only migration rather than an edit to the applied one.

-- `create extension` puts btree_gist in public by default, where the linter
-- rightly objects to it. The exclusion constraint's index looks its operator
-- class up by identity, so relocating the extension does not disturb it.
alter extension btree_gist set schema extensions;

-- Every function in `public` is reachable as an RPC endpoint. These three are
-- trigger bodies and nothing else should ever call them, and two of them are
-- security definer, so leaving them callable would hand anon a way to write an
-- audit row or fire a broadcast by hand.
revoke execute on function public.reservation_audit_write() from public, anon, authenticated;
revoke execute on function public.reservation_broadcast() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
