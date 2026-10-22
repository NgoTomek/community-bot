-- post_message(p_passcode, p_run_id, p_text, p_as_community) and the database-assigned seq.
begin;

select cbtest.communities();

insert into public.runs (id, lead_id, need, partner_ids, backend, status) values
  ('00000000-0000-4000-8000-000000000001', 'north-lab', 'Workshop for 40', '["south-club","east-guild"]', 'mock', 'negotiating'),
  ('00000000-0000-4000-8000-000000000003', 'north-lab', 'Hack day', '["south-club"]', 'mock', 'confirmed');

insert into public.messages (run_id, seq, speaker, community_id, role, text) values
  ('00000000-0000-4000-8000-000000000001', 0, 'North Lab organiser', 'north-lab', 'human', 'Workshop for 40'),
  ('00000000-0000-4000-8000-000000000001', 1, 'North Lab Bot', 'north-lab', 'bot', 'We need a space and a co-host.');

set local role anon;

select cbtest.throws($$select public.post_message('wrong', '00000000-0000-4000-8000-000000000001', 'hi')$$,
  '%passcode%', 'post_message rejects a wrong passcode');
select cbtest.throws($$select public.post_message('community', '00000000-0000-4000-8000-000000000001', '   ')$$,
  '%between 1 and 600%', 'post_message rejects blank text');
select cbtest.throws(format('select public.post_message(%L, %L, %L)', 'community', '00000000-0000-4000-8000-000000000001', repeat('x', 601)),
  '%between 1 and 600%', 'post_message rejects 601 characters');
select cbtest.throws($$select public.post_message('community', '00000000-0000-4000-8000-000000000001', 'hi', 'west-hall')$$,
  '%not part of this run%', 'post_message rejects a community outside the run');
select cbtest.throws($$select public.post_message('community', '00000000-0000-4000-8000-000000000003', 'hi')$$,
  '%has ended%', 'post_message rejects an ended run');
select cbtest.throws($$select public.post_message('community', '00000000-0000-4000-8000-0000000000ff', 'hi')$$,
  '%unknown run%', 'post_message rejects an unknown run');
select cbtest.throws($$insert into public.messages (run_id, seq, speaker, community_id, role, text)
                      values ('00000000-0000-4000-8000-000000000001', 99, 'x', 'north-lab', 'human', 'sneaky')$$,
  '%permission denied%', 'anon cannot insert into messages directly');

select cbtest.ok(public.post_message('community', '00000000-0000-4000-8000-000000000001', repeat('y', 600)) is not null,
  'post_message accepts 600 characters');
select cbtest.ok(public.post_message('community', '00000000-0000-4000-8000-000000000001', '  Keep it under 40 people  ') is not null,
  'post_message accepts general guidance');
select cbtest.ok(public.post_message('community', '00000000-0000-4000-8000-000000000001', 'We can only do Thursdays', 'south-club') is not null,
  'post_message accepts speaking for a partner');

reset role;

select cbtest.ok(
  (select count(*) = 1 from public.messages
    where run_id = '00000000-0000-4000-8000-000000000001' and text = 'Keep it under 40 people'
      and role = 'human' and speaker = 'Organiser' and community_id = 'north-lab'
      and as_community is null and stance is null and evidence is null
      and delay_ms = least(4000, 700 + 25 * 23)),
  'general guidance is a human message filed under the lead, trimmed, paced for replay');
select cbtest.ok(
  (select count(*) = 1 from public.messages
    where run_id = '00000000-0000-4000-8000-000000000001' and text = 'We can only do Thursdays'
      and role = 'human' and speaker = 'South Club organiser'
      and community_id = 'south-club' and as_community = 'south-club'),
  'speaking for a community sets community_id and as_community');
select cbtest.ok(
  (select array_agg(seq order by seq) = array[0, 1, 2, 3, 4] from public.messages
    where run_id = '00000000-0000-4000-8000-000000000001'),
  'posted messages continue the run''s seq order');

set local role service_role;
insert into public.messages (run_id, seq, speaker, community_id, role, text)
values ('00000000-0000-4000-8000-000000000001', 1, 'South Club Bot', 'south-club', 'bot', 'We have a room.');
reset role;

select cbtest.ok(
  (select seq = 5 from public.messages where run_id = '00000000-0000-4000-8000-000000000001' and text = 'We have a room.'),
  'a worker insert with a stale seq gets the next free seq instead of colliding');

rollback;
