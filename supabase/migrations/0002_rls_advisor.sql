-- Advisor follow-up.
-- Secret tables get an explicit deny policy (RLS stays on, anon still cannot read them).
-- communities_public becomes security invoker. The base table holds only public card
-- fields, so anon may read those columns. Inbox tokens stay in community_secrets.
-- The security-definer RPCs stay executable by anon on purpose: that is the phone contract.
-- claim_job and require_passcode stay service_role only.

drop policy if exists "no anon access" on public.approvals;
drop policy if exists "no anon access" on public.community_secrets;
drop policy if exists "no anon access" on public.settings;
drop policy if exists "no anon access" on public.rsvps;
drop policy if exists "no anon access" on public.luma_events;
drop policy if exists "anon read communities" on public.communities;

create policy "no anon access" on public.approvals for all to anon, authenticated using (false) with check (false);
create policy "no anon access" on public.community_secrets for all to anon, authenticated using (false) with check (false);
create policy "no anon access" on public.settings for all to anon, authenticated using (false) with check (false);
create policy "no anon access" on public.rsvps for all to anon, authenticated using (false) with check (false);
create policy "no anon access" on public.luma_events for all to anon, authenticated using (false) with check (false);

create policy "anon read communities" on public.communities for select to anon, authenticated using (true);

grant select (id, name, status, card, source_urls, updated_at)
  on public.communities to anon, authenticated;

alter view public.communities_public set (security_invoker = true);
