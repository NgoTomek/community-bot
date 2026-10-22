-- Assertion helpers for the SQL tests. run.sh applies this first, in a throwaway database.
-- Every other test file runs in one transaction and rolls back.

create schema if not exists cbtest;
grant usage on schema cbtest to anon, authenticated, service_role;

create or replace function cbtest.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAILED: %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end;
$$;

create or replace function cbtest.throws(p_sql text, p_like text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike p_like then
      raise exception 'FAILED: % (wrong error: %)', p_msg, sqlerrm;
    end if;
    raise notice 'ok - %', p_msg;
    return;
  end;
  raise exception 'FAILED: % (no error raised)', p_msg;
end;
$$;

-- Four made-up communities used by the fixtures.
create or replace function cbtest.communities() returns void language sql as $$
  insert into public.communities (id, name, status, card) values
    ('north-lab', 'North Lab', 'confirmed', '{}'),
    ('south-club', 'South Club', 'confirmed', '{}'),
    ('east-guild', 'East Guild', 'draft', '{}'),
    ('west-hall', 'West Hall', 'confirmed', '{}');
$$;

grant execute on all functions in schema cbtest to anon, authenticated, service_role;
