-- System-wide funnel templates.
-- `funnel_templates.workspace_id` becomes nullable: NULL marks a template
-- curated by the platform, visible to every workspace, never owned or
-- editable by one. Workspace-owned templates (workspace_id set) keep their
-- existing behavior unchanged.

alter table public.funnel_templates
  alter column workspace_id drop not null;

drop policy if exists funnel_templates_member_select on public.funnel_templates;
create policy funnel_templates_member_select on public.funnel_templates
  for select to authenticated
  using (
    workspace_id is null
    or (select private.is_funnel_workspace_member(workspace_id))
  );

-- Defense in depth: system templates are seeded directly by service_role
-- (this migration), never through the admin-mutation trigger path used by
-- create_funnel_template. Block any future attempt to insert/update a row
-- into a NULL workspace through that trigger explicitly, rather than
-- relying only on the revoked table grants.
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
    if v_workspace_id is null then
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

-- create_funnel_from_template now targets an explicit destination
-- workspace instead of assuming the template's own workspace — required
-- for system templates, which have no workspace of their own.
create or replace function private.create_funnel_from_template_impl(
  p_template_id uuid,
  p_workspace_id uuid,
  p_name text default null,
  p_slug text default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_template public.funnel_templates%rowtype;
  v_name text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_template
  from public.funnel_templates
  where id = p_template_id;

  if not found or not (v_template.workspace_id is null or private.is_funnel_workspace_member(v_template.workspace_id)) then
    raise exception using errcode = '42501', message = 'Template access denied';
  end if;

  if not private.is_funnel_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace access denied';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_template.name);

  return query
  select * from private.create_funnel_from_document_impl(
    p_workspace_id,
    v_template.snapshot,
    v_name,
    v_template.description,
    p_slug,
    v_template.source_version_id
  );
end;
$$;

drop function if exists public.create_funnel_from_template(uuid, text, text);
create or replace function public.create_funnel_from_template(
  p_template_id uuid,
  p_workspace_id uuid,
  p_name text default null,
  p_slug text default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.create_funnel_from_template_impl(p_template_id, p_workspace_id, p_name, p_slug); $$;

revoke execute on function private.create_funnel_from_template_impl(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.create_funnel_from_template(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.create_funnel_from_template_impl(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.create_funnel_from_template(uuid, uuid, text, text) to authenticated, service_role;
