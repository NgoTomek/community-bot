-- Organisers can pause, resume or stop a negotiation. The worker checks runs.control between
-- turns: it waits while paused, and on stop ends the run as declined ("stopped by organiser").

alter table public.runs
  add column if not exists control text not null default 'running'
    check (control in ('running', 'paused', 'stopped'));

comment on column public.runs.control is
  'running | paused | stopped. Set by set_run_control; honoured by the worker between turns.';

create or replace function public.set_run_control(p_passcode text, p_run_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.runs%rowtype;
  v_control text;
begin
  perform public.require_passcode(p_passcode);

  if p_action is null or p_action not in ('pause', 'resume', 'stop') then
    raise exception 'Action must be pause, resume or stop' using errcode = '22023';
  end if;

  select * into v_run from public.runs where id = p_run_id for update;
  if not found then
    raise exception 'Unknown run' using errcode = 'P0002';
  end if;
  if v_run.status in ('confirmed', 'declined', 'error') then
    raise exception 'This run has ended (status: %)', v_run.status using errcode = '22023';
  end if;
  if v_run.control = 'stopped' then
    raise exception 'This run was stopped by an organiser' using errcode = '22023';
  end if;

  v_control := case p_action when 'pause' then 'paused' when 'resume' then 'running' else 'stopped' end;
  update public.runs set control = v_control where id = p_run_id;

  -- While a deal is out for responses no Bot is taking turns, so a stop ends the run here.
  -- During a negotiation the worker ends it at the next turn boundary.
  if v_control = 'stopped' and v_run.status = 'pending_approval' then
    update public.runs
       set status = 'declined', decline_reason = 'stopped by organiser', typing = null
     where id = p_run_id;
  end if;

  select * into v_run from public.runs where id = p_run_id;
  return jsonb_build_object('run_id', v_run.id, 'control', v_run.control, 'status', v_run.status);
end;
$$;

revoke all on function public.set_run_control(text, uuid, text) from PUBLIC;
grant execute on function public.set_run_control(text, uuid, text) to anon, authenticated, service_role;
