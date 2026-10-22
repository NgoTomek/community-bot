-- worker_status heartbeat and get_worker_status().
begin;

set local role anon;
select cbtest.throws('select * from public.worker_status', '%permission denied%', 'anon cannot select worker_status');
select cbtest.throws($$insert into public.worker_status (backend) values ('mock')$$, '%permission denied%',
  'anon cannot write worker_status');
select cbtest.ok(public.get_worker_status() = '{"online":false,"backend":null,"last_seen":null}'::jsonb,
  'no heartbeat yet reports offline');
reset role;

set local role service_role;
insert into public.worker_status (id, backend, last_seen) values (1, 'mock', now() - interval '1 hour')
on conflict (id) do update set backend = excluded.backend, last_seen = excluded.last_seen;
insert into public.worker_status (id, backend) values (1, 'openai')
on conflict (id) do update set backend = excluded.backend;
reset role;

select cbtest.ok((select count(*) = 1 from public.worker_status), 'heartbeats upsert a single row');

set local role anon;
select cbtest.ok((public.get_worker_status() ->> 'online')::boolean,
  'a fresh heartbeat is online even when the worker sends an old timestamp');
select cbtest.ok(public.get_worker_status() ->> 'backend' = 'openai', 'get_worker_status reports the latest backend');
select cbtest.ok(public.get_worker_status() ? 'last_seen', 'get_worker_status reports last_seen');
reset role;

alter table public.worker_status disable trigger worker_status_stamp;
update public.worker_status set last_seen = now() - interval '31 seconds';
alter table public.worker_status enable trigger worker_status_stamp;
select cbtest.ok(not (public.get_worker_status() ->> 'online')::boolean, 'a heartbeat older than 30 seconds is offline');

select cbtest.throws($$insert into public.worker_status (id, backend) values (2, 'mock')$$, '%check%',
  'there is only ever one worker_status row');

rollback;
