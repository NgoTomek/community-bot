-- Community Bots database schema.
-- Run once in the Supabase SQL editor (or: psql "$DATABASE_URL" -f supabase/schema.sql).
-- Safe to re-run. Policies are DEMO-GRADE: see "Security notes" in README.md.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.communities (
  id          text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  status      text not null default 'draft' check (status in ('draft', 'confirmed')),
  card        jsonb not null,
  source_urls jsonb not null default '[]'::jsonb,
  -- Backend that drafted the card; 'mock' cards are sample data and are labelled in the UI.
  backend     text check (backend in ('grokbot', 'openai', 'mock')),
  updated_at  timestamptz not null default now()
);

create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('draft_card', 'confirm_card', 'match', 'negotiate')),
  params     jsonb not null default '{}'::jsonb check (pg_column_size(params) < 32000),
  -- Checked by the worker against WORKER_PASSCODE, then cleared. Never readable by anon.
  passcode   text check (char_length(passcode) <= 200),
  status     text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  progress   text,
  result     jsonb,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists jobs_queued_idx on public.jobs (created_at) where status = 'queued';

create table if not exists public.runs (
  id          uuid primary key default gen_random_uuid(),
  lead_id     text not null references public.communities (id),
  need        text not null,
  partner_ids jsonb not null default '[]'::jsonb,
  backend     text not null check (backend in ('grokbot', 'openai', 'mock')),
  status      text not null default 'matching' check (status in (
                'matching', 'negotiating', 'compiling', 'pending_approval', 'confirmed', 'declined', 'error')),
  consensus   boolean,
  deal_id     uuid,
  -- Verified match candidates for the chosen partners (copied from the match job).
  match       jsonb,
  -- Community id whose Bot is writing right now (typing indicator), null when idle.
  typing      text,
  error       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.runs (id) on delete cascade,
  seq          int not null,
  speaker      text not null,
  community_id text not null,
  role         text not null check (role in ('human', 'bot')),
  text         text not null,
  stance       text check (stance in ('offer', 'counter', 'accept', 'decline', 'question')),
  -- {quote, verified, field}. "verified" is advisory: the browser recomputes it from the card.
  evidence     jsonb,
  delay_ms     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (run_id, seq)
);

create table if not exists public.deals (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.runs (id) on delete cascade,
  deal       jsonb not null,
  status     text not null default 'pending_approval' check (status in (
               'pending_approval', 'confirmed', 'declined', 'changes_requested')),
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  deal_id      uuid not null references public.deals (id) on delete cascade,
  community_id text not null,
  token        uuid not null unique default gen_random_uuid(),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'changes_requested')),
  note         text check (char_length(note) <= 500),
  updated_at   timestamptz not null default now(),
  primary key (deal_id, community_id)
);

create table if not exists public.announcements (
  deal_id      uuid not null references public.deals (id) on delete cascade,
  community_id text not null,
  text         text not null,
  primary key (deal_id, community_id)
);

create table if not exists public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists rsvps_deal_idx on public.rsvps (deal_id);

-- ---------------------------------------------------------------------------
-- Row level security (demo-grade)
--   anon can read everything, insert jobs and rsvps, and change approvals only through
--   approve(token, status, note). The worker uses the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.communities   enable row level security;
alter table public.jobs          enable row level security;
alter table public.runs          enable row level security;
alter table public.messages      enable row level security;
alter table public.deals         enable row level security;
alter table public.approvals     enable row level security;
alter table public.announcements enable row level security;
alter table public.rsvps         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['communities', 'jobs', 'runs', 'messages', 'deals', 'approvals', 'announcements', 'rsvps'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists "anon queue jobs" on public.jobs;
create policy "anon queue jobs" on public.jobs for insert to anon, authenticated
  with check (status = 'queued' and progress is null and result is null and error is null);

drop policy if exists "anon rsvp to confirmed events" on public.rsvps;
create policy "anon rsvp to confirmed events" on public.rsvps for insert to anon, authenticated
  with check (exists (select 1 from public.deals d where d.id = deal_id and d.status = 'confirmed'));

-- Anon may read every jobs column except the passcode. (Select explicit columns from the web app.)
revoke select on public.jobs from anon, authenticated;
grant select (id, type, params, status, progress, result, error, created_at) on public.jobs to anon, authenticated;
revoke truncate on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- approve(token, status, note): the only way anon can change an approval.
-- Recomputes the deal: all approved -> confirmed; any declined -> declined;
-- any change requested -> changes_requested; else pending_approval. A confirmed deal is final.
-- ---------------------------------------------------------------------------

create or replace function public.approve(token uuid, status text, note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_approval public.approvals%rowtype;
  v_deal     public.deals%rowtype;
  v_total    int;
  v_approved int;
  v_declined int;
  v_changes  int;
  v_status   text;
begin
  if approve.status not in ('approved', 'declined', 'changes_requested') then
    raise exception 'Status must be approved, declined or changes_requested' using errcode = '22023';
  end if;

  select * into v_approval from public.approvals a where a.token = approve.token for update;
  if not found then
    raise exception 'This approval link is not valid' using errcode = 'P0002';
  end if;

  select * into v_deal from public.deals d where d.id = v_approval.deal_id for update;
  if v_deal.status = 'confirmed' then
    raise exception 'This deal is already confirmed' using errcode = '22023';
  end if;

  update public.approvals a
     set status = approve.status,
         note = nullif(left(btrim(coalesce(approve.note, '')), 500), ''),
         updated_at = now()
   where a.deal_id = v_approval.deal_id and a.community_id = v_approval.community_id;

  select count(*),
         count(*) filter (where a.status = 'approved'),
         count(*) filter (where a.status = 'declined'),
         count(*) filter (where a.status = 'changes_requested')
    into v_total, v_approved, v_declined, v_changes
    from public.approvals a
   where a.deal_id = v_deal.id;

  v_status := case
    when v_approved = v_total then 'confirmed'
    when v_declined > 0 then 'declined'
    when v_changes > 0 then 'changes_requested'
    else 'pending_approval'
  end;

  update public.deals d set status = v_status where d.id = v_deal.id;
  update public.runs r
     set status = case v_status when 'confirmed' then 'confirmed' when 'declined' then 'declined' else 'pending_approval' end
   where r.id = v_deal.run_id;

  return json_build_object(
    'deal_id', v_deal.id,
    'community_id', v_approval.community_id,
    'status', approve.status,
    'deal_status', v_status
  );
end;
$$;

revoke all on function public.approve(uuid, text, text) from public;
grant execute on function public.approve(uuid, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime: every table except communities.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['jobs', 'runs', 'messages', 'deals', 'approvals', 'announcements', 'rsvps'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
