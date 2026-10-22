-- Worker heartbeat. The worker upserts the single row (id = 1) every 10 seconds; the browser asks
-- get_worker_status() whether a worker is online. Anon cannot select the table itself.

create table if not exists public.worker_status (
  id        int primary key default 1 check (id = 1),
  backend   text not null check (backend in ('grokbot', 'openai', 'mock')),
  last_seen timestamptz not null default now()
);

alter table public.worker_status enable row level security;
drop policy if exists "no anon access" on public.worker_status;
create policy "no anon access" on public.worker_status for all to anon, authenticated using (false) with check (false);
revoke all on table public.worker_status from PUBLIC, anon, authenticated;
grant all on table public.worker_status to service_role;

-- last_seen comes from the database clock, so a worker with a skewed clock cannot look online.
create or replace function public.stamp_worker_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.last_seen := now();
  return new;
end;
$$;

drop trigger if exists worker_status_stamp on public.worker_status;
create trigger worker_status_stamp
  before insert or update on public.worker_status
  for each row execute function public.stamp_worker_status();

create or replace function public.get_worker_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
              'online', w.last_seen > now() - interval '30 seconds',
              'backend', w.backend,
              'last_seen', w.last_seen)
       from public.worker_status w
      where w.id = 1),
    jsonb_build_object('online', false, 'backend', null, 'last_seen', null)
  );
$$;

revoke all on function public.stamp_worker_status() from PUBLIC, anon, authenticated;
revoke all on function public.get_worker_status() from PUBLIC;
grant execute on function public.get_worker_status() to anon, authenticated, service_role;
