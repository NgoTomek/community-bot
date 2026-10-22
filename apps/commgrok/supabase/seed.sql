-- Demo data for community-bot. Mirrors lib/seed-data.ts (same fixed UUIDs, same people).
-- All names are fictional. Dates are relative to today (Europe/London), so the seed never goes stale.
-- Safe to re-run: event data is truncated first. Like `npm run demo:reset`, accounts people created are kept
-- and the two demo users are restored. (`npm run demo:reset` in Supabase mode does the same from lib/seed-data.ts.)
-- Run AFTER every file in supabase/migrations/, in filename order (SQL editor, or `supabase db reset`).

-- No "cascade" and no teams here: truncating teams would cascade to public.users and wipe every account.
truncate table public.event_log, public.rsvps, public.approvals, public.event_required_teams, public.events;

-- Teams (upsert, so users.team_id stays valid; any other team is removed and its users lose their team)
delete from public.teams
 where id not in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
insert into public.teams (id, name, role, avatar_url) values
  ('11111111-1111-4111-8111-111111111111', 'Builders Collective', 'Host community', null),
  ('22222222-2222-4222-8222-222222222222', 'Canal Works', 'Venue & co-host', null)
on conflict (id) do update set name = excluded.name, role = excluded.role, avatar_url = excluded.avatar_url;

-- Demo users (password "demo1234", scrypt hashes from lib/password.ts). Mirrors SEED_USERS in lib/seed-data.ts.
delete from public.users
 where email in ('tom@commgrok.demo', 'maya@commgrok.demo')
    or id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
insert into public.users (id, email, name, team_id, password_hash) values
  ('a0000000-0000-4000-8000-000000000001', 'tom@commgrok.demo', 'Tom Adeyemi', '11111111-1111-4111-8111-111111111111',
   'scrypt$30f2fbed1259c1ed88aed9f84fb8cf4d$cf280eaa89684100e5599965fb204cb28e075e13d228af9d9686b9b9a8e1e6cc03f39ad920ca248222e9969b0c7e1e7fe060beef6524aa2b42a863678912fb38'),
  ('a0000000-0000-4000-8000-000000000002', 'maya@commgrok.demo', 'Maya Brooks', '22222222-2222-4222-8222-222222222222',
   'scrypt$aa207a3cee9d19fe2ead7a269ac4c87c$d2df328d3d7208f003e9c7225e622e3961cb75d13706636d72292491515d05d7bcdcb244e1ccdebd3c3abaaace634a0568c84c05a50108c34d4dbd09995bb069');

-- Prompt Engineering Clinic (proposed)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000001', 'prompt-engineering-clinic', 'Prompt Engineering Clinic', 'workshop', array['Builders Collective', 'Women Who Ship']::text[],
  'Bring a prompt that isn''t working. We''ll fix it together, live, on the big screen.

**What to bring**

- A laptop
- One real prompt from your project (anything you''re happy to share)
- Questions about evals, structured output or tool use

Mentors from three London AI teams will rotate between tables. Beginners very welcome.',
  ((current_date + 7) + time '18:30') at time zone 'Europe/London',
  ((current_date + 7) + time '20:30') at time zone 'Europe/London',
  'Europe/London',
  'Canal Works', '12 Wharf Road, London N1 7GR', null, '/covers/prompt-clinic.svg', 30, 'Free',
  '[{"name":"Priya Nair","avatar_url":null},{"name":"Sofia Marin","avatar_url":null}]'::jsonb, 'public', 'proposed', 'bot', 1,
  null, now() - interval '0 days' - interval '1 hour', now() - interval '0 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000001', 'Community bot', 'proposed', now() - interval '0 days' - interval '1 hour');

-- Canal Run + Coffee (proposed)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000002', 'canal-run-and-coffee', 'Canal Run + Coffee', 'social', array['Indie Hackers LDN']::text[],
  'An easy 5k along Regent''s Canal at conversation pace, then coffee and pastries at the venue.

No one gets left behind: we split into two pace groups. Bag drop available.',
  ((current_date + 10) + time '09:30') at time zone 'Europe/London',
  ((current_date + 10) + time '11:00') at time zone 'Europe/London',
  'Europe/London',
  'Granary Square steps', 'Granary Square, London N1C 4AA', null, '/covers/canal-run.svg', null, 'Free',
  '[{"name":"Leo Chen","avatar_url":null}]'::jsonb, 'public', 'proposed', 'bot', 1,
  null, now() - interval '1 days' - interval '1 hour', now() - interval '1 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000002', 'Community bot', 'proposed', now() - interval '1 days' - interval '1 hour');

-- Open Source Sprint: Ship Your First PR (proposed)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000003', 'open-source-sprint', 'Open Source Sprint: Ship Your First PR', 'hackathon', array['Open Source London', 'Builders Collective']::text[],
  'A one-day sprint for people who''ve always meant to contribute to open source.

Maintainers from five projects bring hand-picked *good first issues*. You pair up, ship a pull request, and we ring a bell for every merge.

Lunch is on the venue. Bring a laptop with git set up.',
  ((current_date + 16) + time '10:00') at time zone 'Europe/London',
  ((current_date + 16) + time '17:00') at time zone 'Europe/London',
  'Europe/London',
  'Canal Works', '12 Wharf Road, London N1 7GR', null, '/covers/oss-sprint.svg', 40, 'Free',
  '[{"name":"Jonah Pike","avatar_url":null},{"name":"Amara Okafor","avatar_url":null}]'::jsonb, 'public', 'proposed', 'manual', 1,
  null, now() - interval '2 days' - interval '1 hour', now() - interval '2 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000003', 'Tom Adeyemi', 'proposed', now() - interval '2 days' - interval '1 hour');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Tom Adeyemi', 'approved', null, 1, now() - interval '2 days' - interval '1 hour' + interval '30 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000003', 'Tom Adeyemi (Builders Collective)', 'approved', now() - interval '2 days' - interval '1 hour' + interval '30 minutes');

-- London AI Builders Meetup #14 (published)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000004', 'london-ai-builders-14', 'London AI Builders Meetup #14', 'meetup', array['London AI Builders', 'Builders Collective']::text[],
  'Our monthly meetup for people building with AI in London.

**Running order**

1. 18:30 Doors, pizza and intros
2. 19:00 Three 10-minute demos from the community
3. 19:45 Open floor: what are you stuck on?
4. 20:15 Drinks by the canal

Want to demo? Reply in the community chat and the bot will add you to the list.',
  ((current_date + 5) + time '18:30') at time zone 'Europe/London',
  ((current_date + 5) + time '21:00') at time zone 'Europe/London',
  'Europe/London',
  'Canal Works', '12 Wharf Road, London N1 7GR', null, '/covers/ai-builders.svg', 120, 'Free',
  '[{"name":"Tom Adeyemi","avatar_url":null},{"name":"Priya Nair","avatar_url":null}]'::jsonb, 'public', 'published', 'bot', 1,
  now() - interval '6 days' - interval '1 hour' + interval '2 hours', now() - interval '6 days' - interval '1 hour', now() - interval '6 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000004', 'Community bot', 'proposed', now() - interval '6 days' - interval '1 hour');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Tom Adeyemi', 'approved', null, 1, now() - interval '6 days' - interval '1 hour' + interval '30 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000004', 'Tom Adeyemi (Builders Collective)', 'approved', now() - interval '6 days' - interval '1 hour' + interval '30 minutes');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Maya Brooks', 'approved', null, 1, now() - interval '6 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000004', 'Maya Brooks (Canal Works)', 'approved', now() - interval '6 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000004', 'System', 'published', now() - interval '6 days' - interval '1 hour' + interval '2 hours');
insert into public.rsvps (event_id, name, email, status, created_at) values
  ('e0000000-0000-4000-8000-000000000004', 'Alex Morgan', 'alex.morgan@example.com', 'going', now() - interval '450 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Bea Kowalski', 'bea.kowalski@example.com', 'going', now() - interval '400 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Chidi Obi', 'chidi.obi@example.com', 'going', now() - interval '350 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Dana Levi', 'dana.levi@example.com', 'going', now() - interval '300 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Eitan Shah', 'eitan.shah@example.com', 'going', now() - interval '250 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Farah Khan', 'farah.khan@example.com', 'going', now() - interval '200 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Gus Lindqvist', 'gus.lindqvist@example.com', 'going', now() - interval '150 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Hana Sato', 'hana.sato@example.com', 'going', now() - interval '100 minutes'),
  ('e0000000-0000-4000-8000-000000000004', 'Iris Doyle', 'iris.doyle@example.com', 'going', now() - interval '50 minutes');

-- Lightning Talks: Agents in Production (published)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000005', 'agents-in-production-lightning-talks', 'Lightning Talks: Agents in Production', 'talk', array['London AI Builders', 'Women Who Ship']::text[],
  'Six five-minute talks from people running AI agents in production. What broke, what it cost and what they''d do differently.

Small room, so places are limited. If it''s full, join the waitlist and we''ll let you know if a spot opens up.',
  ((current_date + 6) + time '18:00') at time zone 'Europe/London',
  ((current_date + 6) + time '20:00') at time zone 'Europe/London',
  'Europe/London',
  'Lantern Hall', '41 Pentonville Road, London N1 9HF', null, '/covers/lightning-talks.svg', 10, 'Free',
  '[{"name":"Sofia Marin","avatar_url":null}]'::jsonb, 'public', 'published', 'manual', 1,
  now() - interval '8 days' - interval '1 hour' + interval '2 hours', now() - interval '8 days' - interval '1 hour', now() - interval '8 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000005', 'Tom Adeyemi', 'proposed', now() - interval '8 days' - interval '1 hour');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Tom Adeyemi', 'approved', null, 1, now() - interval '8 days' - interval '1 hour' + interval '30 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000005', 'Tom Adeyemi (Builders Collective)', 'approved', now() - interval '8 days' - interval '1 hour' + interval '30 minutes');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Maya Brooks', 'approved', null, 1, now() - interval '8 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000005', 'Maya Brooks (Canal Works)', 'approved', now() - interval '8 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000005', 'System', 'published', now() - interval '8 days' - interval '1 hour' + interval '2 hours');
insert into public.rsvps (event_id, name, email, status, created_at) values
  ('e0000000-0000-4000-8000-000000000005', 'Jamal Reid', 'jamal.reid@example.com', 'going', now() - interval '500 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Kiran Patel', 'kiran.patel@example.com', 'going', now() - interval '450 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Lena Fischer', 'lena.fischer@example.com', 'going', now() - interval '400 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Mo Haddad', 'mo.haddad@example.com', 'going', now() - interval '350 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Nina Rossi', 'nina.rossi@example.com', 'going', now() - interval '300 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Oli Grant', 'oli.grant@example.com', 'going', now() - interval '250 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Pia Jensen', 'pia.jensen@example.com', 'going', now() - interval '200 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Quinn Avery', 'quinn.avery@example.com', 'going', now() - interval '150 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Rhea Kapoor', 'rhea.kapoor@example.com', 'going', now() - interval '100 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Sam Ellis', 'sam.ellis@example.com', 'going', now() - interval '50 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Tara Byrne', 'tara.byrne@example.com', 'waitlist', now() - interval '100 minutes'),
  ('e0000000-0000-4000-8000-000000000005', 'Alex Morgan', 'alex.morgan@example.com', 'waitlist', now() - interval '50 minutes');

-- Women Who Ship: Breakfast Club (published)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000006', 'women-who-ship-breakfast', 'Women Who Ship: Breakfast Club', 'social', array['Women Who Ship']::text[],
  'Coffee, pastries and honest conversation about shipping products. Everyone who identifies as a woman or non-binary is welcome.',
  ((current_date + -6) + time '08:00') at time zone 'Europe/London',
  ((current_date + -6) + time '09:30') at time zone 'Europe/London',
  'Europe/London',
  'Pollen Café', '3 Exmouth Market, London EC1R 4QL', null, '/covers/breakfast-club.svg', 25, 'Free',
  '[{"name":"Amara Okafor","avatar_url":null},{"name":"Sofia Marin","avatar_url":null}]'::jsonb, 'public', 'published', 'bot', 1,
  now() - interval '14 days' - interval '1 hour' + interval '2 hours', now() - interval '14 days' - interval '1 hour', now() - interval '14 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000006', 'Community bot', 'proposed', now() - interval '14 days' - interval '1 hour');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'Tom Adeyemi', 'approved', null, 1, now() - interval '14 days' - interval '1 hour' + interval '30 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000006', 'Tom Adeyemi (Builders Collective)', 'approved', now() - interval '14 days' - interval '1 hour' + interval '30 minutes');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'Maya Brooks', 'approved', null, 1, now() - interval '14 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000006', 'Maya Brooks (Canal Works)', 'approved', now() - interval '14 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000006', 'System', 'published', now() - interval '14 days' - interval '1 hour' + interval '2 hours');
insert into public.rsvps (event_id, name, email, status, created_at) values
  ('e0000000-0000-4000-8000-000000000006', 'Bea Kowalski', 'bea.kowalski@example.com', 'going', now() - interval '700 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Chidi Obi', 'chidi.obi@example.com', 'going', now() - interval '650 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Dana Levi', 'dana.levi@example.com', 'going', now() - interval '600 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Eitan Shah', 'eitan.shah@example.com', 'going', now() - interval '550 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Farah Khan', 'farah.khan@example.com', 'going', now() - interval '500 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Gus Lindqvist', 'gus.lindqvist@example.com', 'going', now() - interval '450 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Hana Sato', 'hana.sato@example.com', 'going', now() - interval '400 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Iris Doyle', 'iris.doyle@example.com', 'going', now() - interval '350 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Jamal Reid', 'jamal.reid@example.com', 'going', now() - interval '300 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Kiran Patel', 'kiran.patel@example.com', 'going', now() - interval '250 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Lena Fischer', 'lena.fischer@example.com', 'going', now() - interval '200 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Mo Haddad', 'mo.haddad@example.com', 'going', now() - interval '150 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Nina Rossi', 'nina.rossi@example.com', 'going', now() - interval '100 minutes'),
  ('e0000000-0000-4000-8000-000000000006', 'Oli Grant', 'oli.grant@example.com', 'going', now() - interval '50 minutes');

-- Rust for AI Engineers (renegotiating: Tom accepted, Maya sent it back to the bots). Next Tuesday at least 8 days out.
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000007', 'rust-for-ai-engineers', 'Rust for AI Engineers: Hands-on Evening', 'workshop', array['Builders Collective', 'Rust London']::text[],
  'A hands-on evening for AI engineers curious about Rust.

- Write a tiny inference server in Rust
- Call it from Python with PyO3
- Benchmark it against the Python version

Bring a laptop with Rust installed (rustup is enough). Pizza from 18:30.',
  ((current_date + 8 + ((2 - extract(dow from current_date + 8)::int + 7) % 7)) + time '18:30') at time zone 'Europe/London',
  ((current_date + 8 + ((2 - extract(dow from current_date + 8)::int + 7) % 7)) + time '21:00') at time zone 'Europe/London',
  'Europe/London',
  'Canal Works', '12 Wharf Road, London N1 7GR', null, '/covers/oss-sprint.svg', 35, 'Free',
  '[{"name":"Jonah Pike","avatar_url":null}]'::jsonb, 'public', 'renegotiating', 'bot', 1,
  null, now() - interval '1 days' - interval '1 hour', now() - interval '1 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000007', 'Community bot', 'proposed', now() - interval '1 days' - interval '1 hour');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'Tom Adeyemi', 'approved', null, 1, now() - interval '1 days' - interval '1 hour' + interval '30 minutes');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000007', 'Tom Adeyemi (Builders Collective)', 'approved', now() - interval '1 days' - interval '1 hour' + interval '30 minutes');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 'Maya Brooks', 'renegotiate', 'Can we move this to a Thursday? Our Tuesday slot is taken.', 1, now() - interval '1 days' - interval '1 hour' + interval '60 minutes');
insert into public.event_log (event_id, actor, action, payload, created_at) values ('e0000000-0000-4000-8000-000000000007', 'Maya Brooks (Canal Works)', 'renegotiate', '{"note":"Can we move this to a Thursday? Our Tuesday slot is taken."}'::jsonb, now() - interval '1 days' - interval '1 hour' + interval '60 minutes');

-- Founder Pitch Night (rejected by Tom / Builders Collective)
insert into public.events (id, slug, title, event_type, communities, description_md, start_at, end_at, timezone,
  venue_name, venue_address, online_url, cover_url, capacity, price_label, hosts, visibility, status, source, revision,
  published_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000008', 'founder-pitch-night', 'Founder Pitch Night: Meet the Investors', 'other', array['Startup Grind LDN']::text[],
  'Pitch your startup to a panel of angel investors. Five minutes per founder, feedback from the panel, networking after.

Tickets include a 1:1 slot with a sponsor.',
  ((current_date + 12) + time '18:00') at time zone 'Europe/London',
  ((current_date + 12) + time '21:00') at time zone 'Europe/London',
  'Europe/London',
  'Canal Works', '12 Wharf Road, London N1 7GR', null, '/covers/lightning-talks.svg', 60, '£25',
  '[{"name":"Growth Partners Ltd","avatar_url":null}]'::jsonb, 'public', 'rejected', 'bot', 1,
  null, now() - interval '3 days' - interval '1 hour', now() - interval '3 days' - interval '1 hour'
);
insert into public.event_required_teams (event_id, team_id) values
  ('e0000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222');
insert into public.event_log (event_id, actor, action, created_at) values ('e0000000-0000-4000-8000-000000000008', 'Community bot', 'proposed', now() - interval '3 days' - interval '1 hour');
insert into public.approvals (event_id, team_id, approver_name, decision, note, event_revision, created_at) values ('e0000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'Tom Adeyemi', 'rejected', 'This is a paid sponsor pitch, not a community event. Our calendar is free events run by the community.', 1, now() - interval '3 days' - interval '1 hour' + interval '30 minutes');
insert into public.event_log (event_id, actor, action, payload, created_at) values ('e0000000-0000-4000-8000-000000000008', 'Tom Adeyemi (Builders Collective)', 'rejected', '{"note":"This is a paid sponsor pitch, not a community event. Our calendar is free events run by the community."}'::jsonb, now() - interval '3 days' - interval '1 hour' + interval '30 minutes');
