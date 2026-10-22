-- set_run_control(p_passcode, p_run_id, p_action) and runs.control.
begin;

select cbtest.communities();

insert into public.runs (id, lead_id, need, partner_ids, backend, status) values
  ('00000000-0000-4000-8000-000000000001', 'north-lab', 'Workshop for 40', '["south-club","east-guild"]', 'mock', 'negotiating'),
  ('00000000-0000-4000-8000-000000000002', 'north-lab', 'Demo night', '["south-club"]', 'mock', 'pending_approval'),
  ('00000000-0000-4000-8000-000000000003', 'north-lab', 'Hack day', '["south-club"]', 'mock', 'confirmed');

select cbtest.ok(
  (select bool_and(control = 'running') from public.runs),
  'runs default to control = running');

set local role anon;

select cbtest.throws($$select public.set_run_control('wrong', '00000000-0000-4000-8000-000000000001', 'pause')$$,
  '%passcode%', 'set_run_control rejects a wrong passcode');
select cbtest.throws($$select public.set_run_control('community', '00000000-0000-4000-8000-000000000001', 'explode')$$,
  '%pause, resume or stop%', 'set_run_control rejects an unknown action');
select cbtest.throws($$select public.set_run_control('community', '00000000-0000-4000-8000-0000000000ff', 'pause')$$,
  '%unknown run%', 'set_run_control rejects an unknown run');
select cbtest.throws($$select public.set_run_control('community', '00000000-0000-4000-8000-000000000003', 'pause')$$,
  '%has ended%', 'set_run_control rejects an ended run');
select cbtest.throws($$update public.runs set control = 'paused' where id = '00000000-0000-4000-8000-000000000001'$$,
  '%permission denied%', 'anon cannot update runs.control directly');

select cbtest.ok(public.set_run_control('community', '00000000-0000-4000-8000-000000000001', 'pause')
  = '{"run_id":"00000000-0000-4000-8000-000000000001","control":"paused","status":"negotiating"}'::jsonb,
  'pause returns {run_id, control: paused, status}');
select cbtest.ok(public.set_run_control('community', '00000000-0000-4000-8000-000000000001', 'pause') ->> 'control' = 'paused',
  'pause is idempotent');
select cbtest.ok(public.set_run_control('community', '00000000-0000-4000-8000-000000000001', 'resume') ->> 'control' = 'running',
  'resume sets control back to running');
select cbtest.ok(public.set_run_control('community', '00000000-0000-4000-8000-000000000001', 'stop')
  = '{"run_id":"00000000-0000-4000-8000-000000000001","control":"stopped","status":"negotiating"}'::jsonb,
  'stop during a negotiation only flags the run; the worker ends it between turns');
select cbtest.throws($$select public.set_run_control('community', '00000000-0000-4000-8000-000000000001', 'resume')$$,
  '%was stopped%', 'a stopped run cannot be resumed');
select cbtest.ok(public.set_run_control('community', '00000000-0000-4000-8000-000000000002', 'stop')
  = '{"run_id":"00000000-0000-4000-8000-000000000002","control":"stopped","status":"declined"}'::jsonb,
  'stop while awaiting responses declines the run immediately');

reset role;

select cbtest.ok(
  (select decline_reason = 'stopped by organiser' from public.runs where id = '00000000-0000-4000-8000-000000000002'),
  'a run stopped while awaiting responses records "stopped by organiser"');

rollback;
