-- Sample runs (npm run seed:sample) are marked so a demo can be replayed with npm run demo:reset.
-- reset_sample_runs() only ever touches runs where is_sample is true.

alter table public.runs
  add column if not exists is_sample boolean not null default false;

comment on column public.runs.is_sample is
  'True for runs created by npm run seed:sample. Only these are reset by reset_sample_runs().';

-- Puts every sample run back to round 1 awaiting responses: approvals pending with history,
-- notes and quick reasons cleared (tokens kept, pointing at the round-1 deal), RSVPs on the
-- run's deals removed. Chat messages are left as they are.
create or replace function public.reset_sample_runs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_run record;
  v_first_deal uuid;
  v_count int;
  v_runs int := 0;
  v_approvals int := 0;
  v_rsvps int := 0;
begin
  v_role := coalesce(auth.role(), '');
  if v_role <> '' and v_role <> 'service_role' then
    raise exception 'reset_sample_runs is restricted to the service role' using errcode = '42501';
  end if;

  for v_run in select r.id from public.runs r where r.is_sample order by r.created_at for update loop
    select d.id into v_first_deal
      from public.deals d
     where d.run_id = v_run.id
     order by d.round, d.created_at
     limit 1;

    update public.approvals a
       set status = 'pending',
           note = null,
           round = 1,
           history = '[]'::jsonb,
           quick_reasons = '[]'::jsonb,
           deal_id = coalesce(v_first_deal, a.deal_id),
           updated_at = now()
     where a.run_id = v_run.id;
    get diagnostics v_count = row_count;
    v_approvals := v_approvals + v_count;

    delete from public.rsvps s
     using public.deals d
     where s.deal_id = d.id
       and d.run_id = v_run.id;
    get diagnostics v_count = row_count;
    v_rsvps := v_rsvps + v_count;

    update public.runs r
       set status = case when v_first_deal is null then r.status else 'pending_approval' end,
           round = 1,
           deal_id = coalesce(v_first_deal, r.deal_id),
           decline_reason = null,
           control = 'running',
           typing = null,
           error = null
     where r.id = v_run.id;
    v_runs := v_runs + 1;
  end loop;

  return jsonb_build_object('runs', v_runs, 'approvals', v_approvals, 'rsvps_removed', v_rsvps);
end;
$$;

revoke all on function public.reset_sample_runs() from PUBLIC, anon, authenticated;
grant execute on function public.reset_sample_runs() to service_role;
