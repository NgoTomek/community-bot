-- community-bot: initial schema.
--
-- The Next.js server talks to Supabase with the SERVICE ROLE key (lib/store/supabase.ts),
-- which bypasses RLS. Team rules (who may approve, the publish rule, revisions) are
-- enforced in lib/workflow.ts. The RLS policies below only matter for the public
-- anon/authenticated keys: they can read published events and teams, and RSVP to
-- published events. RSVP emails are never readable with the public keys.

-- ---------- tables ----------

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text not null unique,
  event_type     text not null default 'meetup'
                 check (event_type in ('meetup', 'talk', 'workshop', 'social', 'hackathon', 'other')),
  communities    text[] not null default '{}',
  description_md text not null default '',
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  timezone       text not null default 'Europe/London',
  venue_name     text,
  venue_address  text,
  online_url     text,
  cover_url      text,
  capacity       int check (capacity is null or capacity > 0),
  price_label    text not null default 'Free',
  hosts          jsonb not null default '[]',
  visibility     text not null default 'public' check (visibility in ('public', 'unlisted')),
  status         text not null default 'proposed'
                 check (status in ('proposed', 'changes_requested', 'published', 'cancelled')),
  source         text not null default 'manual' check (source in ('bot', 'manual')),
  -- Bumped on every content edit. Approvals only count for the current revision.
  revision       int not null default 1,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_at >= start_at)
);

create table if not exists public.event_required_teams (
  event_id  uuid not null references public.events (id) on delete cascade,
  team_id   uuid not null references public.teams (id) on delete cascade,
  primary key (event_id, team_id)
);

create table if not exists public.approvals (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  team_id         uuid not null references public.teams (id),
  approver_name   text not null,
  decision        text not null check (decision in ('approved', 'changes_requested')),
  note            text,
  event_revision  int not null default 1,
  created_at      timestamptz not null default now()
);

create table if not exists public.rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null,
  email       text not null,
  status      text not null default 'going' check (status in ('going', 'waitlist', 'cancelled')),
  created_at  timestamptz not null default now(),
  unique (event_id, email)
);

create table if not exists public.event_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  actor       text not null,
  action      text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists approvals_event_id_idx on public.approvals (event_id);
create index if not exists rsvps_event_id_idx on public.rsvps (event_id);
create index if not exists event_log_event_id_idx on public.event_log (event_id);
create index if not exists events_status_start_idx on public.events (status, start_at);

-- ---------- row level security ----------

alter table public.teams enable row level security;
alter table public.events enable row level security;
alter table public.event_required_teams enable row level security;
alter table public.approvals enable row level security;
alter table public.rsvps enable row level security;
alter table public.event_log enable row level security;

-- Anyone can read published events.
drop policy if exists "Published events are public" on public.events;
create policy "Published events are public" on public.events
  for select to anon, authenticated
  using (status = 'published');

-- Team names are public (shown on approval chips).
drop policy if exists "Teams are public" on public.teams;
create policy "Teams are public" on public.teams
  for select to anon, authenticated
  using (true);

-- Anyone can RSVP to a published event. No select policy: emails are never readable.
drop policy if exists "Anyone can RSVP to published events" on public.rsvps;
create policy "Anyone can RSVP to published events" on public.rsvps
  for insert to anon, authenticated
  with check (
    status in ('going', 'waitlist')
    and exists (select 1 from public.events e where e.id = rsvps.event_id and e.status = 'published')
  );

-- approvals, event_required_teams and event_log have RLS on and no policies:
-- only the service role (the app server) can touch them.

-- ---------- public views (no emails) ----------
-- These run with the view owner's rights, so they can expose safe columns of rsvps
-- even though anon has no select policy on the table itself.

create or replace view public.event_attendees_public as
  select r.event_id,
         split_part(trim(r.name), ' ', 1) as first_name,
         r.status,
         r.created_at
    from public.rsvps r
    join public.events e on e.id = r.event_id
   where e.status = 'published'
     and r.status in ('going', 'waitlist');

create or replace view public.event_rsvp_counts as
  select e.id as event_id,
         count(r.id) filter (where r.status = 'going')::int    as going,
         count(r.id) filter (where r.status = 'waitlist')::int as waitlist
    from public.events e
    left join public.rsvps r on r.event_id = e.id
   where e.status = 'published'
   group by e.id;

grant select on public.event_attendees_public to anon, authenticated;
grant select on public.event_rsvp_counts to anon, authenticated;

-- Realtime: the app uses Realtime *broadcast* on channel `community-events-live`,
-- so no tables need to be added to the supabase_realtime publication.

-- ---------- users (email + password accounts) ----------
-- Passwords are scrypt hashes made by the app server (lib/password.ts).
-- RLS on with no policies: only the service role (the app server) can read or write it.
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text not null,
  team_id       uuid references public.teams(id) on delete set null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
alter table public.users enable row level security;
