-- runs.is_sample and reset_sample_runs(): resets sample runs, never touches real ones.
begin;

select cbtest.communities();

insert into public.runs (id, lead_id, need, partner_ids, backend, status, round, decline_reason, control, is_sample) values
  ('00000000-0000-4000-8000-000000000004', 'north-lab', 'Sample collab', '["south-club"]', 'mock', 'declined', 2, 'no agreement', 'paused', true),
  ('00000000-0000-4000-8000-000000000005', 'north-lab', 'Real collab', '["south-club"]', 'grokbot', 'confirmed', 1, null, 'running', false);

insert into public.deals (id, run_id, deal, round) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000004', '{"title":"Sample round 1"}', 1),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000004', '{"title":"Sample round 2"}', 2),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-000000000005', '{"title":"Real"}', 1);

update public.runs set deal_id = '00000000-0000-4000-8000-0000000000d2' where id = '00000000-0000-4000-8000-000000000004';
update public.runs set deal_id = '00000000-0000-4000-8000-0000000000d5' where id = '00000000-0000-4000-8000-000000000005';

insert into public.approvals (run_id, community_id, deal_id, token, status, note, round, quick_reasons, history) values
  ('00000000-0000-4000-8000-000000000004', 'north-lab', '00000000-0000-4000-8000-0000000000d2',
   '00000000-0000-4000-8000-00000000a001', 'declined', 'Too late for us', 2, '["date"]',
   '[{"round":1,"decision":"renegotiate","note":"Move it","at":"2026-01-01T00:00:00Z"},{"round":2,"decision":"declined","note":"Too late for us","at":"2026-01-02T00:00:00Z"}]'),
  ('00000000-0000-4000-8000-000000000004', 'south-club', '00000000-0000-4000-8000-0000000000d2',
   '00000000-0000-4000-8000-00000000a002', 'approved', null, 2, '[]',
   '[{"round":2,"decision":"approved","note":null,"at":"2026-01-02T00:00:00Z"}]'),
  ('00000000-0000-4000-8000-000000000005', 'north-lab', '00000000-0000-4000-8000-0000000000d5',
   '00000000-0000-4000-8000-00000000a005', 'approved', null, 1, '[]',
   '[{"round":1,"decision":"approved","note":null,"at":"2026-01-02T00:00:00Z"}]'),
  ('00000000-0000-4000-8000-000000000005', 'south-club', '00000000-0000-4000-8000-0000000000d5',
   '00000000-0000-4000-8000-00000000a006', 'approved', 'See you there', 1, '[]',
   '[{"round":1,"decision":"approved","note":"See you there","at":"2026-01-02T00:00:00Z"}]');

insert into public.rsvps (deal_id, name) values
  ('00000000-0000-4000-8000-0000000000d1', 'Sample guest 1'),
  ('00000000-0000-4000-8000-0000000000d1', 'Sample guest 2'),
  ('00000000-0000-4000-8000-0000000000d2', 'Sample guest 3'),
  ('00000000-0000-4000-8000-0000000000d5', 'Real guest 1'),
  ('00000000-0000-4000-8000-0000000000d5', 'Real guest 2'),
  ('00000000-0000-4000-8000-0000000000d5', 'Real guest 3');

select cbtest.ok(
  (select is_sample = false from public.runs r where r.id = '00000000-0000-4000-8000-000000000005'),
  'runs are not samples unless marked');

set local role anon;
select cbtest.throws('select public.reset_sample_runs()', '%permission denied%', 'anon cannot call reset_sample_runs');
reset role;

-- auth.role() reads request.jwt.claim.role on older images and request.jwt.claims on newer ones.
select set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select cbtest.throws('select public.reset_sample_runs()', '%restricted to the service role%',
  'reset_sample_runs refuses a non-service JWT role');
select set_config('request.jwt.claim.role', 'service_role', true),
       set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role service_role;
select cbtest.ok(public.reset_sample_runs() = '{"runs":1,"approvals":2,"rsvps_removed":3}'::jsonb,
  'reset_sample_runs reports one run, two approvals and three RSVPs');
reset role;

select cbtest.ok(
  (select bool_and(status = 'pending' and round = 1 and note is null and history = '[]'::jsonb
                   and quick_reasons = '[]'::jsonb and deal_id = '00000000-0000-4000-8000-0000000000d1')
     from public.approvals where run_id = '00000000-0000-4000-8000-000000000004'),
  'sample approvals are pending, round 1, history cleared, pointing at the round-1 deal');
select cbtest.ok(
  (select array_agg(token::text order by community_id)
          = array['00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002']
     from public.approvals where run_id = '00000000-0000-4000-8000-000000000004'),
  'sample tokens are kept');
select cbtest.ok(
  (select status = 'pending_approval' and round = 1 and deal_id = '00000000-0000-4000-8000-0000000000d1'
          and decline_reason is null and control = 'running'
     from public.runs where id = '00000000-0000-4000-8000-000000000004'),
  'the sample run is back to round 1 awaiting responses');
select cbtest.ok(
  (select count(*) = 0 from public.rsvps s join public.deals d on d.id = s.deal_id
    where d.run_id = '00000000-0000-4000-8000-000000000004'),
  'RSVPs on the sample run''s deals are removed');
select cbtest.ok(
  (select count(*) = 3 from public.rsvps where deal_id = '00000000-0000-4000-8000-0000000000d5'),
  'RSVPs on real runs are kept');
select cbtest.ok(
  (select status = 'confirmed' and deal_id = '00000000-0000-4000-8000-0000000000d5'
     from public.runs where id = '00000000-0000-4000-8000-000000000005'),
  'real runs are not touched');
select cbtest.ok(
  (select bool_and(status = 'approved' and jsonb_array_length(history) = 1)
     from public.approvals where run_id = '00000000-0000-4000-8000-000000000005'),
  'real approvals keep their status and history');
select cbtest.ok(
  (select note = 'See you there' from public.approvals
    where run_id = '00000000-0000-4000-8000-000000000005' and community_id = 'south-club'),
  'real approval notes are kept');

set local role service_role;
select cbtest.ok(public.reset_sample_runs() = '{"runs":1,"approvals":2,"rsvps_removed":0}'::jsonb,
  'resetting twice is harmless');
reset role;

rollback;
