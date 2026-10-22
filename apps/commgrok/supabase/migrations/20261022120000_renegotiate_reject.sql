-- Accept / Reject / Send back to bots.
-- Statuses: proposed | renegotiating | rejected | published | cancelled
-- Decisions: approved | rejected | renegotiate
-- Legacy "changes_requested" is migrated (and the app also reads it as renegotiating/renegotiate).

alter table public.events drop constraint if exists events_status_check;
alter table public.approvals drop constraint if exists approvals_decision_check;

update public.events set status = 'renegotiating' where status = 'changes_requested';
update public.approvals set decision = 'renegotiate' where decision = 'changes_requested';
update public.event_log set action = 'renegotiate' where action = 'changes_requested';

alter table public.events add constraint events_status_check
  check (status in ('proposed', 'renegotiating', 'rejected', 'published', 'cancelled'));
alter table public.approvals add constraint approvals_decision_check
  check (decision in ('approved', 'rejected', 'renegotiate'));

create index if not exists approvals_event_created_idx on public.approvals (event_id, created_at desc);
