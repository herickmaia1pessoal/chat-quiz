-- Fixes a self-inflicted lockout in 20260823020000: the admin-mutation
-- trigger's "system templates cannot be managed through this path" guard
-- fired unconditionally on any insert into funnel_templates with
-- workspace_id NULL — including the direct SQL seed
-- (supabase/seed_system_funnel_templates.sql) that was always meant to be
-- the one legitimate way to create them. It never actually reached
-- production data (the failed insert rolled back), so there is nothing to
-- repair beyond the function itself.
--
-- Fix: the guard only applies to authenticated application sessions
-- (auth.uid() is not null — i.e. traffic through PostgREST/RPC). A direct
-- administrative connection (Management API, SQL Editor, migrations) has no
-- Supabase Auth JWT and therefore auth.uid() is null, so it still bypasses
-- the guard as intended for one-off seeding.

create or replace function private.enforce_funnel_admin_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_funnel_id uuid;
  v_workspace_id uuid;
begin
  if tg_table_name = 'funnels' then
    v_funnel_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'funnel_publications'
     or tg_table_name = 'funnel_integrations' then
    v_funnel_id := case
      when tg_op = 'DELETE' then old.funnel_id else new.funnel_id
    end;
  elsif tg_table_name = 'funnel_templates' then
    v_workspace_id := case
      when tg_op = 'DELETE' then old.workspace_id else new.workspace_id
    end;
    if v_workspace_id is null and (select auth.uid()) is not null then
      raise exception using errcode = '42501', message = 'System templates cannot be managed through this path';
    end if;
  else
    raise exception using errcode = '0A000', message = 'Unsupported administrative mutation target';
  end if;

  if v_funnel_id is not null and not private.is_funnel_admin(v_funnel_id) then
    raise exception using errcode = '42501', message = 'Workspace owner or admin permission required';
  end if;
  if v_workspace_id is not null and not private.is_funnel_workspace_admin(v_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace owner or admin permission required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
