-- Community Bots schema and the phone RPC contract.
-- The organiser PWA (apps/phone, another developer) calls only:
--   get_request(p_token uuid)
--   list_requests(p_inbox uuid)
--   respond(p_token uuid, p_decision text, p_note text, p_quick jsonb)
-- Do not rename those, and do not change their argument or return shapes.
-- Anon has no direct access to approvals, community_secrets, settings, rsvps or luma_events.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.communities (
  id          text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  status      text not null default 'draft' check (status in ('draft', 'confirmed')),
  card        jsonb not null,
  source_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(source_urls) = 'array'),
  updated_at  timestamptz not null default now()
);

create table public.community_secrets (
  community_id text primary key references public.communities (id) on delete cascade,
  inbox_token  uuid not null unique default gen_random_uuid()
);

create table public.settings (
  key   text primary key,
  value text not null
);

-- Demo default. Change it in the SQL editor. Documented in README and docs/SECURITY.md.
insert into public.settings (key, value) values ('organiser_passcode', 'community');

create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('draft_card', 'match', 'negotiate', 'renegotiate', 'publish_luma')),
  params     jsonb not null default '{}'::jsonb,
  status     text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  progress   text,
  result     jsonb,
  error      text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index jobs_queued_idx on public.jobs (created_at) where status = 'queued';

create table public.runs (
  id             uuid primary key default gen_random_uuid(),
  lead_id        text not null references public.communities (id),
  need           text not null,
  partner_ids    jsonb not null default '[]'::jsonb check (jsonb_typeof(partner_ids) = 'array'),
  backend        text not null check (backend in ('grokbot', 'openai', 'mock')),
  status         text not null default 'matching' check (status in (
                   'matching', 'negotiating', 'compiling', 'pending_approval', 'confirmed', 'declined', 'error')),
  consensus      boolean,
  deal_id        uuid,
  round          int not null default 1 check (round >= 1),
  decline_reason text,
  -- Who is writing right now, for the presenter typing dots. Null when idle.
  typing         text,
  error          text,
  created_at     timestamptz not null default now()
);

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.runs (id) on delete cascade,
  seq          int not null,
  speaker      text not null,
  community_id text not null,
  role         text not null check (role in ('human', 'bot')),
  text         text not null,
  stance       text check (stance in ('offer', 'counter', 'accept', 'decline', 'question')),
  -- {quote, verified, field}. verified is advisory: the browser recomputes it.
  evidence     jsonb,
  delay_ms     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (run_id, seq)
);

create table public.deals (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.runs (id) on delete cascade,
  deal       jsonb not null,
  round      int not null default 1,
  status     text not null default 'pending_approval',
  created_at timestamptz not null default now()
);

alter table public.runs
  add constraint runs_deal_id_fkey
  foreign key (deal_id) references public.deals (id) on delete set null;

create table public.approvals (
  run_id        uuid not null references public.runs (id) on delete cascade,
  community_id  text not null references public.communities (id),
  deal_id       uuid not null references public.deals (id),
  token         uuid not null unique default gen_random_uuid(),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'renegotiate')),
  note          text,
  round         int not null default 1,
  quick_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(quick_reasons) = 'array'),
  history       jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  updated_at    timestamptz not null default now(),
  primary key (run_id, community_id)
);
create index approvals_run_idx on public.approvals (run_id);

create table public.announcements (
  deal_id      uuid not null references public.deals (id) on delete cascade,
  community_id text not null,
  text         text not null,
  primary key (deal_id, community_id)
);

create table public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create index rsvps_deal_idx on public.rsvps (deal_id);

create table public.luma_events (
  deal_id       uuid primary key references public.deals (id) on delete cascade,
  luma_event_id text,
  url           text,
  created_at    timestamptz not null default now()
);

-- Public projection of communities. security_invoker stays off so anon can read
-- these columns without a grant on the base table (which also holds nothing secret,
-- but the contract says anon reads the view, not the table).
create view public.communities_public
with (security_invoker = false) as
select id, name, status, card, source_urls, updated_at
from public.communities;

comment on view public.communities_public is
  'Anon-readable community cards. No inbox tokens.';

-- ---------------------------------------------------------------------------
-- RLS. Public catalogue tables are readable by anon. Everything else is
-- reachable only through the security-definer functions below.
-- using (true) is intentional: runs, messages, deals, announcements and jobs
-- are the public record of a collab. Secrets live in other tables with no policy.
-- ---------------------------------------------------------------------------

alter table public.communities        enable row level security;
alter table public.community_secrets  enable row level security;
alter table public.settings           enable row level security;
alter table public.jobs               enable row level security;
alter table public.runs               enable row level security;
alter table public.messages           enable row level security;
alter table public.deals              enable row level security;
alter table public.approvals          enable row level security;
alter table public.announcements      enable row level security;
alter table public.rsvps              enable row level security;
alter table public.luma_events        enable row level security;

create policy "anon read jobs"          on public.jobs          for select to anon, authenticated using (true);
create policy "anon read runs"          on public.runs          for select to anon, authenticated using (true);
create policy "anon read messages"      on public.messages      for select to anon, authenticated using (true);
create policy "anon read deals"         on public.deals         for select to anon, authenticated using (true);
create policy "anon read announcements" on public.announcements for select to anon, authenticated using (true);

revoke all on table public.communities       from PUBLIC, anon, authenticated;
revoke all on table public.community_secrets from PUBLIC, anon, authenticated;
revoke all on table public.settings          from PUBLIC, anon, authenticated;
revoke all on table public.jobs              from PUBLIC, anon, authenticated;
revoke all on table public.runs              from PUBLIC, anon, authenticated;
revoke all on table public.messages          from PUBLIC, anon, authenticated;
revoke all on table public.deals             from PUBLIC, anon, authenticated;
revoke all on table public.approvals         from PUBLIC, anon, authenticated;
revoke all on table public.announcements     from PUBLIC, anon, authenticated;
revoke all on table public.rsvps             from PUBLIC, anon, authenticated;
revoke all on table public.luma_events       from PUBLIC, anon, authenticated;
revoke all on table public.communities_public from PUBLIC, anon, authenticated;

grant select on table public.jobs          to anon, authenticated;
grant select on table public.runs          to anon, authenticated;
grant select on table public.messages      to anon, authenticated;
grant select on table public.deals         to anon, authenticated;
grant select on table public.announcements to anon, authenticated;
grant select on table public.communities_public to anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.require_passcode(p_passcode text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from public.settings where key = 'organiser_passcode';
  if v_expected is null or p_passcode is distinct from v_expected then
    raise exception 'Wrong passcode' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_request(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_approval public.approvals%rowtype;
  v_community public.communities%rowtype;
  v_deal jsonb;
  v_others jsonb;
begin
  select * into v_approval from public.approvals where token = p_token;
  if not found then
    raise exception 'This approval link is not valid' using errcode = 'P0002';
  end if;

  select * into v_community from public.communities where id = v_approval.community_id;
  select d.deal into v_deal from public.deals d where d.id = v_approval.deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'community_id', a.community_id,
           'name', c.name,
           'status', a.status,
           'note', a.note
         ) order by c.name), '[]'::jsonb)
    into v_others
    from public.approvals a
    join public.communities c on c.id = a.community_id
   where a.run_id = v_approval.run_id
     and a.community_id <> v_approval.community_id;

  return jsonb_build_object(
    'token', v_approval.token,
    'status', v_approval.status,
    'note', v_approval.note,
    'round', v_approval.round,
    'history', coalesce(v_approval.history, '[]'::jsonb),
    'community', jsonb_build_object('id', v_community.id, 'name', v_community.name),
    'deal_id', v_approval.deal_id,
    'deal', v_deal,
    'others', v_others
  );
end;
$$;

create or replace function public.list_requests(p_inbox uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(item order by updated_at desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
               'token', a.token,
               'status', a.status,
               'round', a.round,
               'deal_id', a.deal_id,
               'title', d.deal->>'title',
               'date', d.deal->>'date',
               'updated_at', a.updated_at
             ) as item,
             a.updated_at
        from public.approvals a
        join public.community_secrets s on s.community_id = a.community_id
        join public.deals d on d.id = a.deal_id
       where s.inbox_token = p_inbox
    ) q;
  return v_rows;
end;
$$;

create or replace function public.respond(
  p_token uuid,
  p_decision text,
  p_note text default null,
  p_quick jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.approvals%rowtype;
  v_note text;
begin
  if p_decision not in ('approved', 'declined', 'renegotiate') then
    raise exception 'Decision must be approved, declined or renegotiate' using errcode = '22023';
  end if;
  if p_quick is not null and jsonb_typeof(p_quick) <> 'array' then
    raise exception 'p_quick must be a JSON array' using errcode = '22023';
  end if;

  select * into v from public.approvals where token = p_token for update;
  if not found then
    raise exception 'This approval link is not valid' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'This request is no longer pending (status: %)', v.status using errcode = '22023';
  end if;

  v_note := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
  if p_decision in ('declined', 'renegotiate') and char_length(coalesce(v_note, '')) < 3 then
    raise exception 'A note of at least 3 characters is required to decline or renegotiate' using errcode = '22023';
  end if;

  update public.approvals
     set status = p_decision,
         note = v_note,
         quick_reasons = coalesce(p_quick, '[]'::jsonb),
         history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'round', v.round,
           'decision', p_decision,
           'note', v_note,
           'at', now()
         )),
         updated_at = now()
   where run_id = v.run_id
     and community_id = v.community_id
     and status = 'pending';

  if not found then
    raise exception 'This request is no longer pending (status: %)', v.status using errcode = '22023';
  end if;

  return jsonb_build_object('status', p_decision);
end;
$$;

create or replace function public.submit_job(p_passcode text, p_type text, p_params jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_params jsonb;
  v_id uuid;
  v_queued int;
begin
  perform public.require_passcode(p_passcode);

  if p_type not in ('draft_card', 'match', 'negotiate', 'renegotiate', 'publish_luma') then
    raise exception 'Unknown job type: %', p_type using errcode = '22023';
  end if;

  v_params := coalesce(p_params, '{}'::jsonb);
  if jsonb_typeof(v_params) <> 'object' then
    raise exception 'Params must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(v_params::text) > 20000 then
    raise exception 'Params exceed 20kB' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('community-bots-jobs')::bigint);
  select count(*) into v_queued from public.jobs where status = 'queued';
  if v_queued >= 30 then
    raise exception 'Too many queued jobs (limit 30)' using errcode = '54000';
  end if;

  insert into public.jobs (type, params)
  values (p_type, v_params)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.save_card(p_passcode text, p_card jsonb, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_name text;
  v_urls jsonb;
begin
  perform public.require_passcode(p_passcode);

  if p_status not in ('draft', 'confirmed') then
    raise exception 'Status must be draft or confirmed' using errcode = '22023';
  end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object' then
    raise exception 'Card must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(p_card::text) > 100000 then
    raise exception 'Card is too large' using errcode = '22023';
  end if;

  v_id := p_card->>'id';
  v_name := btrim(coalesce(p_card->>'name', ''));
  if v_id is null or v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Community id must be kebab-case' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'Card name is required' using errcode = '22023';
  end if;

  v_urls := coalesce(p_card->'sourceUrls', '[]'::jsonb);
  if jsonb_typeof(v_urls) <> 'array' then
    v_urls := '[]'::jsonb;
  end if;

  insert into public.communities (id, name, status, card, source_urls, updated_at)
  values (v_id, left(v_name, 120), p_status, p_card, v_urls, now())
  on conflict (id) do update
    set name = excluded.name,
        status = excluded.status,
        card = excluded.card,
        source_urls = excluded.source_urls,
        updated_at = now();

  -- Keep an existing inbox token. Rotating it would invalidate the organiser's phone link.
  insert into public.community_secrets (community_id)
  values (v_id)
  on conflict (community_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.get_event(p_deal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.deals%rowtype;
  v_backend text;
  v_communities jsonb;
  v_announcements jsonb;
  v_rsvp_count int;
  v_all_approved boolean;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if not found then
    raise exception 'Unknown event' using errcode = 'P0002';
  end if;

  select r.backend into v_backend from public.runs r where r.id = v_deal.run_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', elem->>'id',
           'name', coalesce(c.name, elem->>'name'),
           'status', c.status
         ) order by ord), '[]'::jsonb)
    into v_communities
    from jsonb_array_elements(coalesce(v_deal.deal->'communities', '[]'::jsonb)) with ordinality as t(elem, ord)
    left join public.communities c on c.id = elem->>'id';

  select coalesce(jsonb_agg(jsonb_build_object(
           'community_id', a.community_id,
           'text', a.text
         ) order by a.community_id), '[]'::jsonb)
    into v_announcements
    from public.announcements a
   where a.deal_id = p_deal_id;

  select count(*) into v_rsvp_count from public.rsvps where deal_id = p_deal_id;

  select coalesce(bool_and(status = 'approved'), false)
    into v_all_approved
    from public.approvals
   where run_id = v_deal.run_id;

  return jsonb_build_object(
    'deal_id', v_deal.id,
    'deal', v_deal.deal,
    'backend', v_backend,
    'communities', v_communities,
    'announcements', v_announcements,
    'rsvp_count', v_rsvp_count,
    'all_approved', v_all_approved
  );
end;
$$;

create or replace function public.rsvp(p_deal_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_count int;
  v_id uuid;
begin
  if not exists (select 1 from public.deals where id = p_deal_id) then
    raise exception 'Unknown event' using errcode = 'P0002';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'Name must be between 1 and 60 characters' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('community-bots-rsvp'), hashtext(p_deal_id::text));
  select count(*) into v_count from public.rsvps where deal_id = p_deal_id;
  if v_count >= 200 then
    raise exception 'This event is full (200 RSVPs)' using errcode = '54000';
  end if;

  insert into public.rsvps (deal_id, name) values (p_deal_id, v_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.presenter_status(p_passcode text, p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform public.require_passcode(p_passcode);

  if not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'Unknown run' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'community_id', a.community_id,
           'name', c.name,
           'status', a.status,
           'round', a.round,
           'note', a.note,
           'token', a.token,
           'inbox_token', s.inbox_token
         ) order by c.name), '[]'::jsonb)
    into v_rows
    from public.approvals a
    join public.communities c on c.id = a.community_id
    join public.community_secrets s on s.community_id = a.community_id
   where a.run_id = p_run_id;

  return v_rows;
end;
$$;

-- Claims one queued job. service_role only (also allowed from the SQL editor, where
-- auth.role() is null). Two callers cannot take the same row: FOR UPDATE SKIP LOCKED.
create or replace function public.claim_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_job public.jobs%rowtype;
begin
  v_role := coalesce(auth.role(), '');
  if v_role <> '' and v_role <> 'service_role' then
    raise exception 'claim_job is restricted to the service role' using errcode = '42501';
  end if;

  select * into v_job
    from public.jobs
   where status = 'queued'
   order by created_at
   for update skip locked
   limit 1;

  if not found then
    return 'null'::jsonb;
  end if;

  update public.jobs
     set status = 'running',
         claimed_at = now()
   where id = v_job.id
   returning * into v_job;

  return to_jsonb(v_job);
end;
$$;

revoke all on function public.require_passcode(text) from PUBLIC, anon, authenticated;
revoke all on function public.get_request(uuid) from PUBLIC;
revoke all on function public.list_requests(uuid) from PUBLIC;
revoke all on function public.respond(uuid, text, text, jsonb) from PUBLIC;
revoke all on function public.submit_job(text, text, jsonb) from PUBLIC;
revoke all on function public.save_card(text, jsonb, text) from PUBLIC;
revoke all on function public.get_event(uuid) from PUBLIC;
revoke all on function public.rsvp(uuid, text) from PUBLIC;
revoke all on function public.presenter_status(text, uuid) from PUBLIC;
revoke all on function public.claim_job() from PUBLIC, anon, authenticated;

grant execute on function public.get_request(uuid) to anon, authenticated, service_role;
grant execute on function public.list_requests(uuid) to anon, authenticated, service_role;
grant execute on function public.respond(uuid, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.submit_job(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.save_card(text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.get_event(uuid) to anon, authenticated, service_role;
grant execute on function public.rsvp(uuid, text) to anon, authenticated, service_role;
grant execute on function public.presenter_status(text, uuid) to anon, authenticated, service_role;
grant execute on function public.require_passcode(text) to service_role;
grant execute on function public.claim_job() to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: messages, runs, jobs, deals. Never approvals.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['messages', 'runs', 'jobs', 'deals'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.messages replica identity full;
alter table public.runs replica identity full;
alter table public.jobs replica identity full;
alter table public.deals replica identity full;
