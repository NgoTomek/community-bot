-- Supabase parity: make the grants the app relies on explicit, so the schema works even on projects
-- where new public tables aren't exposed to the Data API by default. Idempotent: safe to re-run.
-- Run after 20261022000000_init.sql and 20261022120000_renegotiate_reject.sql.

grant usage on schema public to anon, authenticated, service_role;

-- The app server (lib/store/supabase.ts) uses the service role for everything, including demo:reset.
grant select, insert, update, delete on
  public.teams, public.users, public.events, public.event_required_teams,
  public.approvals, public.rsvps, public.event_log
  to service_role;
grant select on public.event_attendees_public, public.event_rsvp_counts to service_role;

-- Public keys: what the RLS policies in 20261022000000_init.sql allow (read published events and teams,
-- RSVP to published events, read the two email-free views). Every other table has RLS on and no policy,
-- so anon/authenticated still can't read rsvps, approvals, users, event_log or event_required_teams.
grant select on public.teams, public.events to anon, authenticated;
grant insert on public.rsvps to anon, authenticated;
grant select on public.event_attendees_public, public.event_rsvp_counts to anon, authenticated;

-- Re-assert RLS (no-op when already on).
alter table public.teams enable row level security;
alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.event_required_teams enable row level security;
alter table public.approvals enable row level security;
alter table public.rsvps enable row level security;
alter table public.event_log enable row level security;

-- The store reads these in created_at order per event.
create index if not exists event_log_event_created_idx on public.event_log (event_id, created_at);
create index if not exists rsvps_event_created_idx on public.rsvps (event_id, created_at);
