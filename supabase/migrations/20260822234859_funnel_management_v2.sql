-- Funnel Builder V2 operational management
--
-- Adds transactional operations for duplicate/archive/delete/import/export and
-- workspace-scoped templates sourced from immutable published snapshots.

create table public.funnel_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_funnel_id uuid references public.funnels(id) on delete set null,
  source_version_id uuid references public.funnel_versions(id) on delete set null,
  name text not null,
  description text,
  category text not null default 'Personalizado',
  snapshot jsonb not null
    check (
      jsonb_typeof(snapshot) = 'object'
      and snapshot->>'schemaVersion' = '2'
    ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_templates_name_length
    check (char_length(name) between 1 and 160),
  constraint funnel_templates_description_length
    check (description is null or char_length(description) <= 2000),
  constraint funnel_templates_category_length
    check (char_length(category) between 1 and 80)
);

create index funnel_templates_workspace_updated_idx
  on public.funnel_templates (workspace_id, updated_at desc, id);
create index funnel_templates_source_funnel_idx
  on public.funnel_templates (source_funnel_id)
  where source_funnel_id is not null;
create index funnel_templates_source_version_idx
  on public.funnel_templates (source_version_id)
  where source_version_id is not null;

alter table public.funnel_templates enable row level security;

create policy funnel_templates_member_select on public.funnel_templates
  for select to authenticated
  using ((select private.is_funnel_workspace_member(workspace_id)));

revoke all on table public.funnel_templates from anon, authenticated;
grant select on table public.funnel_templates to authenticated;
grant select, insert, update, delete on table public.funnel_templates to service_role;

-- Recursively remap only JSON string values that exactly match a structural
-- UUID. This keeps user copy and URLs intact and traverses the document once.
create or replace function private.remap_funnel_jsonb_uuid_values(
  p_value jsonb,
  p_id_map jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_type text;
  v_text text;
begin
  if p_value is null then
    return null;
  end if;

  v_type := jsonb_typeof(p_value);
  if v_type = 'string' then
    v_text := p_value #>> '{}';
    if p_id_map ? v_text then
      return to_jsonb(p_id_map->>v_text);
    end if;
    return p_value;
  end if;

  if v_type = 'array' then
    return coalesce((
      select jsonb_agg(
        private.remap_funnel_jsonb_uuid_values(item, p_id_map)
        order by ordinality
      )
      from jsonb_array_elements(p_value) with ordinality as items(item, ordinality)
    ), '[]'::jsonb);
  end if;

  if v_type = 'object' then
    return coalesce((
      select jsonb_object_agg(
        entry.key,
        private.remap_funnel_jsonb_uuid_values(entry.value, p_id_map)
      )
      from jsonb_each(p_value) entry
    ), '{}'::jsonb);
  end if;

  return p_value;
end;
$$;

-- Build a clean copy of a V2 document. All structural ids are regenerated and
-- references embedded in logic/content/settings are remapped with them.
create or replace function private.remap_funnel_document(
  p_document jsonb,
  p_funnel_id uuid,
  p_title text,
  p_slug text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_document jsonb := p_document;
  v_id_map jsonb;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object' then
    raise exception using errcode = '22023', message = 'Imported funnel document must be a JSON object';
  end if;

  if p_document->>'schemaVersion' <> '2' then
    raise exception using errcode = '22023', message = 'Only funnel document schema version 2 is supported';
  end if;

  if octet_length(p_document::text) > 900000 then
    raise exception using errcode = '22023', message = 'Funnel document exceeds the 900 KB import limit';
  end if;

  if jsonb_typeof(p_document->'pages') <> 'array'
     or jsonb_typeof(p_document->'elements') <> 'array'
     or jsonb_typeof(p_document->'variables') <> 'array' then
    raise exception using errcode = '22023', message = 'pages, elements and variables must be arrays';
  end if;

  if jsonb_array_length(p_document->'pages') not between 1 and 100
     or jsonb_array_length(p_document->'elements') > 5000
     or jsonb_array_length(p_document->'variables') > 500 then
    raise exception using errcode = '22023', message = 'Imported document exceeds its structural limits';
  end if;

  if exists (
    with all_ids as (
      select item->>'id' as id from jsonb_array_elements(p_document->'pages') item
      union all
      select item->>'id' as id from jsonb_array_elements(p_document->'elements') item
      union all
      select item->>'id' as id from jsonb_array_elements(p_document->'variables') item
    )
    select 1 from all_ids
    group by id
    having id is null or id = '' or count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'All imported structural ids must be present and globally unique';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_document->'elements') item
    where not ((item->>'type') = any (array[
      'section', 'container', 'spacer', 'divider',
      'heading', 'text', 'image', 'video', 'button', 'icon', 'embed', 'audio',
      'short_text', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio', 'upload',
      'quiz_choice', 'slider', 'rating', 'progress', 'countdown', 'accordion',
      'offer', 'price', 'testimonial', 'faq', 'benefits', 'cta', 'social_proof', 'logo_cloud'
    ]::text[]))
  ) then
    raise exception using errcode = '22023', message = 'Imported document contains an unsupported element type';
  end if;

  -- Cast before changing anything so malformed UUIDs abort the transaction.
  perform (item->>'id')::uuid
  from (
    select item from jsonb_array_elements(p_document->'pages') item
    union all
    select item from jsonb_array_elements(p_document->'elements') item
    union all
    select item from jsonb_array_elements(p_document->'variables') item
  ) ids;

  select coalesce(
    jsonb_object_agg(structural_id, gen_random_uuid()::text),
    '{}'::jsonb
  ) into v_id_map
  from (
    select item->>'id' as structural_id from jsonb_array_elements(p_document->'pages') item
    union all
    select item->>'id' as structural_id from jsonb_array_elements(p_document->'elements') item
    union all
    select item->>'id' as structural_id from jsonb_array_elements(p_document->'variables') item
  ) ids;

  v_document := private.remap_funnel_jsonb_uuid_values(v_document, v_id_map);

  v_document := jsonb_set(v_document, '{schemaVersion}', '2'::jsonb, true);
  v_document := jsonb_set(v_document, '{funnelId}', to_jsonb(p_funnel_id), true);
  v_document := jsonb_set(v_document, '{title}', to_jsonb(p_title), true);
  v_document := jsonb_set(v_document, '{slug}', to_jsonb(p_slug), true);

  return v_document;
end;
$$;

create or replace function private.create_funnel_from_document_impl(
  p_workspace_id uuid,
  p_document jsonb,
  p_name text,
  p_description text default null,
  p_slug text default null,
  p_source_version_id uuid default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_funnel_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_name text := nullif(trim(p_name), '');
  v_description text := nullif(trim(p_description), '');
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_attempt integer := 0;
  v_document jsonb;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not private.is_funnel_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace access denied';
  end if;

  if v_name is null or char_length(v_name) > 160 then
    raise exception using errcode = '22023', message = 'Funnel name must contain between 1 and 160 characters';
  end if;

  if v_description is not null and char_length(v_description) > 2000 then
    raise exception using errcode = '22023', message = 'Funnel description cannot exceed 2000 characters';
  end if;

  v_base_slug := private.normalize_funnel_slug(coalesce(nullif(trim(p_slug), ''), v_name));
  if v_base_slug = '' then
    v_base_slug := 'funil';
  end if;
  v_base_slug := left(v_base_slug, 120);

  loop
    v_suffix := case when v_attempt = 0 then '' else '-' || (v_attempt + 1)::text end;
    v_slug := left(v_base_slug, 120 - char_length(v_suffix)) || v_suffix;

    begin
      insert into public.funnels (
        id, workspace_id, name, description, slug, status, settings,
        draft_revision, created_by
      ) values (
        v_funnel_id, p_workspace_id, v_name, v_description, v_slug, 'draft',
        '{}'::jsonb, 0, v_user_id
      );
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 1000 then
        raise exception using errcode = '23505', message = 'Could not allocate a unique funnel slug';
      end if;
    end;
  end loop;

  v_document := private.remap_funnel_document(
    p_document, v_funnel_id, v_name, v_slug
  );
  perform private.apply_funnel_document(v_funnel_id, v_document);
  v_snapshot := private.build_funnel_snapshot(v_funnel_id);

  insert into public.funnel_versions (
    id, funnel_id, version_number, revision, kind, label,
    snapshot, source_version_id, created_by
  ) values (
    v_version_id, v_funnel_id, 1, 0, 'draft', 'Versão inicial',
    v_snapshot, p_source_version_id, v_user_id
  );

  update public.funnels
  set latest_draft_version_id = v_version_id,
      updated_at = now()
  where id = v_funnel_id;

  return query select v_funnel_id, 0::bigint, v_slug;
end;
$$;

create or replace function private.duplicate_funnel_impl(
  p_funnel_id uuid,
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
  v_source public.funnels%rowtype;
  v_document jsonb;
  v_name text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_source
  from public.funnels
  where id = p_funnel_id;

  if not found or not private.is_funnel_workspace_member(v_source.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  v_document := private.build_funnel_snapshot(p_funnel_id);
  v_name := coalesce(nullif(trim(p_name), ''), left('Cópia de ' || v_source.name, 160));

  return query
  select * from private.create_funnel_from_document_impl(
    v_source.workspace_id,
    v_document,
    v_name,
    v_source.description,
    p_slug,
    v_source.latest_draft_version_id
  );
end;
$$;

create or replace function private.set_funnel_archived_impl(
  p_funnel_id uuid,
  p_archived boolean
)
returns table (funnel_id uuid, status text, archived_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_funnel public.funnels%rowtype;
  v_changed_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_archived is null then
    raise exception using errcode = '22023', message = 'Archived state is required';
  end if;

  select * into v_funnel
  from public.funnels
  where id = p_funnel_id
  for update;

  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  if p_archived then
    update public.funnel_publications
    set is_active = false,
        unpublished_at = v_changed_at
    where funnel_publications.funnel_id = p_funnel_id
      and is_active;

    update public.funnels
    set status = 'archived',
        archived_at = v_changed_at,
        updated_at = v_changed_at
    where id = p_funnel_id;
  else
    update public.funnels
    set status = 'draft',
        archived_at = null,
        updated_at = v_changed_at
    where id = p_funnel_id
      and status = 'archived';
  end if;

  return query
  select f.id, f.status, f.archived_at
  from public.funnels f
  where f.id = p_funnel_id;
end;
$$;

create or replace function private.delete_funnel_impl(
  p_funnel_id uuid,
  p_confirmation_name text
)
returns table (funnel_id uuid, deleted_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_funnel public.funnels%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_funnel
  from public.funnels
  where id = p_funnel_id
  for update;

  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  if nullif(trim(p_confirmation_name), '') is null
     or trim(p_confirmation_name) <> v_funnel.name then
    raise exception using errcode = '22023', message = 'Funnel name confirmation does not match';
  end if;

  delete from public.funnels where id = p_funnel_id;
  return query select p_funnel_id, v_funnel.name;
end;
$$;

create or replace function private.export_funnel_v2_impl(p_funnel_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_funnel public.funnels%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_funnel from public.funnels where id = p_funnel_id;
  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  return jsonb_build_object(
    'format', 'funnelflow.funnel',
    'formatVersion', 2,
    'exportedAt', now(),
    'source', jsonb_build_object(
      'funnelId', v_funnel.id,
      'workspaceId', v_funnel.workspace_id,
      'name', v_funnel.name,
      'description', v_funnel.description,
      'revision', v_funnel.draft_revision,
      'publishedVersionId', v_funnel.published_version_id
    ),
    'document', private.build_funnel_snapshot(p_funnel_id)
  );
end;
$$;

create or replace function private.import_funnel_v2_impl(
  p_workspace_id uuid,
  p_payload jsonb,
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
  v_document jsonb;
  v_name text;
  v_description text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Import payload must be a JSON object';
  end if;

  if p_payload->>'format' = 'funnelflow.funnel' then
    if p_payload->>'formatVersion' <> '2' then
      raise exception using errcode = '22023', message = 'Unsupported FunnelFlow export version';
    end if;
    v_document := p_payload->'document';
    v_description := nullif(p_payload#>>'{source,description}', '');
  elsif p_payload->>'schemaVersion' = '2' then
    v_document := p_payload;
  else
    raise exception using errcode = '22023', message = 'File is not a FunnelFlow V2 export';
  end if;

  v_name := coalesce(
    nullif(trim(p_name), ''),
    nullif(trim(v_document->>'title'), ''),
    'Funil importado'
  );

  return query
  select * from private.create_funnel_from_document_impl(
    p_workspace_id,
    v_document,
    v_name,
    v_description,
    p_slug,
    null
  );
end;
$$;

create or replace function private.create_funnel_template_impl(
  p_funnel_id uuid,
  p_name text default null,
  p_description text default null,
  p_category text default 'Personalizado'
)
returns table (template_id uuid, name text, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_funnel public.funnels%rowtype;
  v_version public.funnel_versions%rowtype;
  v_template_id uuid := gen_random_uuid();
  v_name text;
  v_description text;
  v_category text;
  v_created_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_funnel from public.funnels where id = p_funnel_id;
  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  if v_funnel.published_version_id is null then
    raise exception using errcode = '55000', message = 'Publish the funnel before creating a template';
  end if;

  select * into v_version
  from public.funnel_versions
  where id = v_funnel.published_version_id
    and funnel_id = p_funnel_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Published funnel version not found';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_funnel.name);
  v_description := coalesce(nullif(trim(p_description), ''), v_funnel.description);
  v_category := coalesce(nullif(trim(p_category), ''), 'Personalizado');

  if char_length(v_name) > 160
     or (v_description is not null and char_length(v_description) > 2000)
     or char_length(v_category) > 80 then
    raise exception using errcode = '22023', message = 'Template metadata exceeds its allowed length';
  end if;

  insert into public.funnel_templates (
    id, workspace_id, source_funnel_id, source_version_id,
    name, description, category, snapshot, created_by, created_at, updated_at
  ) values (
    v_template_id, v_funnel.workspace_id, v_funnel.id, v_version.id,
    v_name, v_description, v_category, v_version.snapshot,
    v_user_id, v_created_at, v_created_at
  );

  return query select v_template_id, v_name, v_created_at;
end;
$$;

create or replace function private.create_funnel_from_template_impl(
  p_template_id uuid,
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

  if not found or not private.is_funnel_workspace_member(v_template.workspace_id) then
    raise exception using errcode = '42501', message = 'Template access denied';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_template.name);

  return query
  select * from private.create_funnel_from_document_impl(
    v_template.workspace_id,
    v_template.snapshot,
    v_name,
    v_template.description,
    p_slug,
    v_template.source_version_id
  );
end;
$$;

-- Exposed wrappers remain invoker functions. Their private implementations do
-- the privileged write only after authenticating and checking tenant access.
create or replace function public.duplicate_funnel(
  p_funnel_id uuid,
  p_name text default null,
  p_slug text default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.duplicate_funnel_impl(p_funnel_id, p_name, p_slug); $$;

create or replace function public.set_funnel_archived(
  p_funnel_id uuid,
  p_archived boolean
)
returns table (funnel_id uuid, status text, archived_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.set_funnel_archived_impl(p_funnel_id, p_archived); $$;

create or replace function public.delete_funnel(
  p_funnel_id uuid,
  p_confirmation_name text
)
returns table (funnel_id uuid, deleted_name text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.delete_funnel_impl(p_funnel_id, p_confirmation_name); $$;

create or replace function public.export_funnel_v2(p_funnel_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.export_funnel_v2_impl(p_funnel_id); $$;

create or replace function public.import_funnel_v2(
  p_workspace_id uuid,
  p_payload jsonb,
  p_name text default null,
  p_slug text default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.import_funnel_v2_impl(p_workspace_id, p_payload, p_name, p_slug); $$;

create or replace function public.create_funnel_template(
  p_funnel_id uuid,
  p_name text default null,
  p_description text default null,
  p_category text default 'Personalizado'
)
returns table (template_id uuid, name text, created_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$ select * from private.create_funnel_template_impl(p_funnel_id, p_name, p_description, p_category); $$;

create or replace function public.create_funnel_from_template(
  p_template_id uuid,
  p_name text default null,
  p_slug text default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language sql volatile security invoker set search_path = ''
as $$ select * from private.create_funnel_from_template_impl(p_template_id, p_name, p_slug); $$;

revoke execute on function private.remap_funnel_jsonb_uuid_values(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke execute on function private.remap_funnel_document(jsonb, uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.create_funnel_from_document_impl(uuid, jsonb, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function private.duplicate_funnel_impl(uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.set_funnel_archived_impl(uuid, boolean) from public, anon, authenticated, service_role;
revoke execute on function private.delete_funnel_impl(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function private.export_funnel_v2_impl(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.import_funnel_v2_impl(uuid, jsonb, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.create_funnel_template_impl(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.create_funnel_from_template_impl(uuid, text, text) from public, anon, authenticated, service_role;

revoke execute on function public.duplicate_funnel(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.set_funnel_archived(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.delete_funnel(uuid, text) from public, anon, authenticated;
revoke execute on function public.export_funnel_v2(uuid) from public, anon, authenticated;
revoke execute on function public.import_funnel_v2(uuid, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.create_funnel_template(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_funnel_from_template(uuid, text, text) from public, anon, authenticated;

grant execute on function private.duplicate_funnel_impl(uuid, text, text) to authenticated, service_role;
grant execute on function private.set_funnel_archived_impl(uuid, boolean) to authenticated, service_role;
grant execute on function private.delete_funnel_impl(uuid, text) to authenticated, service_role;
grant execute on function private.export_funnel_v2_impl(uuid) to authenticated, service_role;
grant execute on function private.import_funnel_v2_impl(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function private.create_funnel_template_impl(uuid, text, text, text) to authenticated, service_role;
grant execute on function private.create_funnel_from_template_impl(uuid, text, text) to authenticated, service_role;

grant execute on function public.duplicate_funnel(uuid, text, text) to authenticated, service_role;
grant execute on function public.set_funnel_archived(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_funnel(uuid, text) to authenticated, service_role;
grant execute on function public.export_funnel_v2(uuid) to authenticated, service_role;
grant execute on function public.import_funnel_v2(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function public.create_funnel_template(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.create_funnel_from_template(uuid, text, text) to authenticated, service_role;
