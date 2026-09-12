-- `supabase db advisors --type performance` flagged two permissive select
-- policies on `court` for the same role, which means both get evaluated on
-- every read. One policy per role says the same thing for less work: everybody
-- sees a live court, and active staff also see the retired ones.

drop policy "anyone may read a live court" on public.court;
drop policy "active staff may read every court" on public.court;

create policy "anyone may read a live court"
  on public.court for select to anon
  using (retired_at is null);

create policy "staff also see retired courts"
  on public.court for select to authenticated
  using (retired_at is null or (select private.is_active_staff()));
