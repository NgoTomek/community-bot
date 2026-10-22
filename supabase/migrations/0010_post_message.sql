-- Organisers can post into a negotiation: general guidance for every Bot, or speaking for one
-- community (that community's Bot then sits out its next turn and the text is used as its reply).
-- Anon still cannot insert into messages directly. post_message is the only way in.

alter table public.messages
  add column if not exists as_community text;

comment on column public.messages.as_community is
  'Community a human spoke for via post_message(p_as_community). Null for general organiser guidance.';

-- Humans and the worker now write to the same conversation at the same time, so the database
-- owns the order: seq = max(seq) + 1 per run, serialised per run by an advisory lock.
-- A seq supplied by the caller is replaced.
create or replace function public.assign_message_seq()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('community-bots-messages'), hashtext(new.run_id::text));
  select coalesce(max(m.seq), -1) + 1 into new.seq
    from public.messages m
   where m.run_id = new.run_id;
  return new;
end;
$$;

drop trigger if exists messages_assign_seq on public.messages;
create trigger messages_assign_seq
  before insert on public.messages
  for each row execute function public.assign_message_seq();

create or replace function public.post_message(
  p_passcode text,
  p_run_id uuid,
  p_text text,
  p_as_community text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.runs%rowtype;
  v_text text;
  v_as text;
  v_name text;
  v_id uuid;
begin
  perform public.require_passcode(p_passcode);

  select * into v_run from public.runs where id = p_run_id;
  if not found then
    raise exception 'Unknown run' using errcode = 'P0002';
  end if;
  if v_run.status in ('confirmed', 'declined', 'error') then
    raise exception 'This run has ended (status: %)', v_run.status using errcode = '22023';
  end if;

  v_text := btrim(coalesce(p_text, ''));
  if char_length(v_text) < 1 or char_length(v_text) > 600 then
    raise exception 'Message must be between 1 and 600 characters' using errcode = '22023';
  end if;

  if (select count(*) from public.messages m where m.run_id = p_run_id and m.role = 'human') >= 50 then
    raise exception 'Too many organiser messages on this run (limit 50)' using errcode = '54000';
  end if;

  v_as := nullif(btrim(coalesce(p_as_community, '')), '');
  if v_as is not null then
    if v_as <> v_run.lead_id and not (v_run.partner_ids ? v_as) then
      raise exception 'Community % is not part of this run', v_as using errcode = '22023';
    end if;
    select c.name into v_name from public.communities c where c.id = v_as;
  end if;

  -- community_id is not null: general guidance is filed under the lead community, and
  -- as_community says whether the organiser spoke for a community.
  insert into public.messages (run_id, seq, speaker, community_id, role, text, delay_ms, as_community)
  values (
    p_run_id,
    0,
    case when v_as is null then 'Organiser' else coalesce(v_name, v_as) || ' organiser' end,
    coalesce(v_as, v_run.lead_id),
    'human',
    v_text,
    least(4000, 700 + 25 * char_length(v_text)),
    v_as
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke insert, update, delete on table public.messages from PUBLIC, anon, authenticated;
revoke all on function public.assign_message_seq() from PUBLIC, anon, authenticated;
revoke all on function public.post_message(text, uuid, text, text) from PUBLIC;
grant execute on function public.post_message(text, uuid, text, text) to anon, authenticated, service_role;
