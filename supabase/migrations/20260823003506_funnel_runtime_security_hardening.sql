-- Funnel Builder V2 runtime and authorization hardening.
--
-- This migration intentionally follows the initial V2, integrations and
-- management migrations. It narrows privileged operations, validates the
-- immutable publication snapshot, bounds public runtime data after merges and
-- makes funnel deletion deterministic in the presence of restrictive FKs.

-- ---------------------------------------------------------------------------
-- Bounded JSON helpers and RBAC
-- ---------------------------------------------------------------------------

create or replace function private.funnel_jsonb_object_within_limits(
  p_value jsonb,
  p_max_bytes integer,
  p_max_keys integer,
  p_max_key_length integer
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_count integer := 0;
begin
  if jsonb_typeof(p_value) <> 'object'
     or p_max_bytes < 2
     or p_max_keys < 0
     or p_max_key_length < 1
     or octet_length(p_value::text) > p_max_bytes then
    return false;
  end if;

  for v_key in select jsonb_object_keys(p_value)
  loop
    v_count := v_count + 1;
    if v_count > p_max_keys
       or char_length(v_key) < 1
       or char_length(v_key) > p_max_key_length
       or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_.-]*$' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.is_funnel_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()->>'role') = 'service_role', false)
    or (
      (select auth.uid()) is not null
      and exists (
        select 1
        from public.workspaces workspace_row
        where workspace_row.id = p_workspace_id
          and (
            workspace_row.owner_id = (select auth.uid())
            or exists (
              select 1
              from public.workspace_members member_row
              where member_row.workspace_id = workspace_row.id
                and member_row.user_id = (select auth.uid())
                and member_row.role in ('owner', 'admin')
            )
          )
      )
    );
$$;

create or replace function private.is_funnel_admin(p_funnel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.funnels funnel_row
    where funnel_row.id = p_funnel_id
      and private.is_funnel_workspace_admin(funnel_row.workspace_id)
  );
$$;

revoke execute on function private.funnel_jsonb_object_within_limits(jsonb, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_funnel_workspace_admin(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_funnel_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_funnel_workspace_admin(uuid) to authenticated, service_role;
grant execute on function private.is_funnel_admin(uuid) to authenticated, service_role;

alter table public.funnel_sessions
  add column if not exists first_interaction_at timestamptz;

create index if not exists funnel_sessions_funnel_first_interaction_idx
  on public.funnel_sessions (funnel_id, first_interaction_at desc)
  where first_interaction_at is not null;

alter table public.funnel_sessions
  add constraint funnel_sessions_values_bounded
  check (private.funnel_jsonb_object_within_limits(values, 262144, 250, 128))
  not valid;
alter table public.funnel_sessions
  add constraint funnel_sessions_lead_bounded
  check (private.funnel_jsonb_object_within_limits(lead, 32768, 64, 128))
  not valid;
alter table public.funnel_submissions
  add constraint funnel_submissions_lead_bounded
  check (private.funnel_jsonb_object_within_limits(lead, 32768, 64, 128))
  not valid;
alter table public.funnel_events
  add constraint funnel_events_payload_bounded
  check (octet_length(payload::text) <= 32768)
  not valid;

alter table public.funnel_sessions validate constraint funnel_sessions_values_bounded;
alter table public.funnel_sessions validate constraint funnel_sessions_lead_bounded;
alter table public.funnel_submissions validate constraint funnel_submissions_lead_bounded;
alter table public.funnel_events validate constraint funnel_events_payload_bounded;

-- Members retain draft authoring. Publishing, publication state changes,
-- archival/deletion, integrations and template management require admin/owner.
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

drop trigger if exists funnel_admin_publish_state on public.funnels;
create trigger funnel_admin_publish_state
  before update of status, archived_at, published_version_id, published_revision
  on public.funnels
  for each row
  when (
    old.status is distinct from new.status
    or old.archived_at is distinct from new.archived_at
    or old.published_version_id is distinct from new.published_version_id
    or old.published_revision is distinct from new.published_revision
  )
  execute function private.enforce_funnel_admin_mutation();

drop trigger if exists funnel_admin_delete on public.funnels;
create trigger funnel_admin_delete
  before delete on public.funnels
  for each row execute function private.enforce_funnel_admin_mutation();

drop trigger if exists funnel_admin_publications on public.funnel_publications;
create trigger funnel_admin_publications
  before insert or update or delete on public.funnel_publications
  for each row execute function private.enforce_funnel_admin_mutation();

drop trigger if exists funnel_admin_integrations on public.funnel_integrations;
create trigger funnel_admin_integrations
  before insert or update or delete on public.funnel_integrations
  for each row execute function private.enforce_funnel_admin_mutation();

drop trigger if exists funnel_admin_templates on public.funnel_templates;
create trigger funnel_admin_templates
  before insert or update or delete on public.funnel_templates
  for each row execute function private.enforce_funnel_admin_mutation();

drop policy if exists funnel_webhook_deliveries_member_select
  on public.funnel_webhook_deliveries;
create policy funnel_webhook_deliveries_admin_select
  on public.funnel_webhook_deliveries
  for select to authenticated
  using ((select private.is_funnel_admin(funnel_id)));

revoke execute on function private.enforce_funnel_admin_mutation()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Element registry invariants
-- ---------------------------------------------------------------------------

alter table public.funnel_elements
  add constraint funnel_elements_known_type check (
    type in (
      'section', 'container', 'spacer', 'divider', 'heading', 'text',
      'image', 'video', 'button', 'icon', 'embed', 'audio', 'short_text',
      'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio',
      'upload', 'quiz_choice', 'slider', 'rating', 'progress', 'countdown',
      'accordion', 'offer', 'price', 'testimonial', 'faq', 'benefits',
      'cta', 'social_proof', 'logo_cloud'
    )
  ) not valid;

alter table public.funnel_elements
  add constraint funnel_elements_field_key_valid check (
    type not in (
      'short_text', 'email', 'phone', 'number', 'date', 'select',
      'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
    )
    or (
      content ? 'fieldKey'
      and content->>'fieldKey' ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'
    )
  ) not valid;

alter table public.funnel_elements validate constraint funnel_elements_known_type;
alter table public.funnel_elements validate constraint funnel_elements_field_key_valid;

create unique index funnel_elements_field_key_unique_idx
  on public.funnel_elements (funnel_id, (content->>'fieldKey'))
  where type in (
    'short_text', 'email', 'phone', 'number', 'date', 'select',
    'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
  );

create or replace function private.validate_funnel_element_parent()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_child public.funnel_elements%rowtype;
  v_parent public.funnel_elements%rowtype;
  v_has_cycle boolean := false;
begin
  select * into v_child
  from public.funnel_elements element_row
  where element_row.id = new.id;
  if not found then
    return null;
  end if;

  if v_child.type = 'section' then
    if v_child.parent_id is not null then
      raise exception using errcode = '23514', message = 'Section elements must be page roots';
    end if;
    return null;
  end if;

  if v_child.parent_id is null then
    raise exception using errcode = '23514', message = 'Only section elements may be page roots';
  end if;

  select * into v_parent
  from public.funnel_elements element_row
  where element_row.id = v_child.parent_id;

  if not found
     or v_parent.funnel_id <> v_child.funnel_id
     or v_parent.page_id <> v_child.page_id
     or v_parent.type not in ('section', 'container') then
    raise exception using errcode = '23514', message = 'Element parent is incompatible with the component registry';
  end if;

  -- Follow the complete ancestor chain at deferred-constraint time. Checking
  -- only the immediate parent would allow two containers to reference each
  -- other in the same transaction.
  with recursive parent_chain(id, parent_id, path, has_cycle) as (
    select
      v_child.id,
      v_child.parent_id,
      array[v_child.id]::uuid[],
      false
    union all
    select
      parent_row.id,
      parent_row.parent_id,
      chain.path || parent_row.id,
      parent_row.id = any(chain.path)
    from parent_chain chain
    join public.funnel_elements parent_row
      on parent_row.id = chain.parent_id
    where not chain.has_cycle
      and cardinality(chain.path) <= 5000
  )
  select coalesce(bool_or(has_cycle or cardinality(path) > 5000), false)
  into v_has_cycle
  from parent_chain;

  if v_has_cycle then
    raise exception using errcode = '23514', message = 'Funnel element hierarchy cannot contain a cycle';
  end if;

  return null;
end;
$$;

drop trigger if exists funnel_elements_parent_registry on public.funnel_elements;
create constraint trigger funnel_elements_parent_registry
  after insert or update
  on public.funnel_elements
  deferrable initially deferred
  for each row execute function private.validate_funnel_element_parent();

revoke execute on function private.validate_funnel_element_parent()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage attack surface and per-session quota
-- ---------------------------------------------------------------------------

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/webm', 'application/pdf'
    ]::text[]
where id = 'funnel-assets';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/webm', 'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ]::text[]
where id = 'funnel-uploads';

create or replace function private.safe_funnel_object_size(p_value text)
returns bigint
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_size bigint;
begin
  if p_value is null or trim(p_value) = '' then
    return 0;
  end if;
  v_size := p_value::bigint;
  if v_size < 0 or v_size > 10485760 then
    return null;
  end if;
  return v_size;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end;
$$;

create or replace function private.can_upload_to_funnel_session(
  p_funnel_id uuid,
  p_session_key uuid,
  p_object_size bigint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_funnel_id is null
     or p_session_key is null
     or p_object_size not between 0 and 10485760 then
    return false;
  end if;

  if not exists (
    select 1
    from public.funnel_sessions session_row
    join public.funnel_publications publication_row
      on publication_row.id = session_row.publication_id
     and publication_row.funnel_id = session_row.funnel_id
     and publication_row.version_id = session_row.version_id
    where session_row.funnel_id = p_funnel_id
      and session_row.session_key = p_session_key
      and session_row.status = 'active'
      and session_row.expires_at > now()
  ) then
    return false;
  end if;

  -- Storage inserts for the same visitor session are serialized so concurrent
  -- requests cannot all observe the same pre-insert count/aggregate.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'funnel-upload:' || p_funnel_id::text || ':' || p_session_key::text,
      0
    )
  );

  -- Re-check session state after waiting for the lock, then evaluate the quota
  -- against every object committed by preceding uploads.
  return exists (
    select 1
    from public.funnel_sessions session_row
    join public.funnel_publications publication_row
      on publication_row.id = session_row.publication_id
     and publication_row.funnel_id = session_row.funnel_id
     and publication_row.version_id = session_row.version_id
    where session_row.funnel_id = p_funnel_id
      and session_row.session_key = p_session_key
      and session_row.status = 'active'
      and session_row.expires_at > now()
  ) and (
    select count(*) < 10
      and coalesce(sum(
        coalesce(private.safe_funnel_object_size(object_row.metadata->>'size'), 0)
      ), 0) + p_object_size <= 52428800
    from storage.objects object_row
    where object_row.bucket_id = 'funnel-uploads'
      and (storage.foldername(object_row.name))[1] = p_funnel_id::text
      and (storage.foldername(object_row.name))[2] = p_session_key::text
  );
end;
$$;

drop policy if exists funnel_uploads_session_insert on storage.objects;
create policy funnel_uploads_session_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'funnel-uploads'
    and private.can_upload_to_funnel_session(
      private.safe_uuid((storage.foldername(name))[1]),
      private.safe_uuid((storage.foldername(name))[2]),
      private.safe_funnel_object_size(metadata->>'size')
    )
  );

revoke execute on function private.safe_funnel_object_size(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.can_upload_to_funnel_session(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.can_upload_to_funnel_session(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function private.safe_funnel_object_size(text) to anon, authenticated;
grant execute on function private.can_upload_to_funnel_session(uuid, uuid, bigint)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot, condition and score helpers
-- ---------------------------------------------------------------------------

create or replace function private.funnel_value_is_empty(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_value is null
    or p_value = 'null'::jsonb
    or p_value = '""'::jsonb
    or p_value = '[]'::jsonb;
$$;

create or replace function private.funnel_scalar_equals(
  p_actual jsonb,
  p_expected jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_actual_text text := coalesce(p_actual #>> '{}', '');
  v_expected_text text := coalesce(p_expected #>> '{}', '');
begin
  if jsonb_typeof(p_actual) = 'number' or jsonb_typeof(p_expected) = 'number' then
    if v_actual_text ~ '^-?[0-9]+(?:\.[0-9]+)?$'
       and v_expected_text ~ '^-?[0-9]+(?:\.[0-9]+)?$' then
      return v_actual_text::numeric = v_expected_text::numeric;
    end if;
  end if;

  if jsonb_typeof(p_actual) = 'boolean' or jsonb_typeof(p_expected) = 'boolean' then
    return lower(v_actual_text) = lower(v_expected_text);
  end if;

  return lower(trim(v_actual_text)) = lower(trim(v_expected_text));
end;
$$;

create or replace function private.funnel_compare_value(
  p_actual jsonb,
  p_operator text,
  p_expected jsonb default null
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_actual_text text := coalesce(p_actual #>> '{}', '');
  v_expected_text text := coalesce(p_expected #>> '{}', '');
begin
  if p_operator = 'is_empty' then
    return private.funnel_value_is_empty(p_actual);
  elsif p_operator = 'is_not_empty' then
    return not private.funnel_value_is_empty(p_actual);
  elsif p_operator in ('equals', 'not_equals') then
    if jsonb_typeof(p_actual) = 'array' then
      for v_item in select value from jsonb_array_elements(p_actual)
      loop
        if private.funnel_scalar_equals(v_item, p_expected) then
          return p_operator = 'equals';
        end if;
      end loop;
      return p_operator = 'not_equals';
    end if;
    return private.funnel_scalar_equals(p_actual, p_expected)
      = (p_operator = 'equals');
  elsif p_operator = 'contains' then
    if jsonb_typeof(p_actual) = 'array' then
      for v_item in select value from jsonb_array_elements(p_actual)
      loop
        if private.funnel_scalar_equals(v_item, p_expected) then
          return true;
        end if;
      end loop;
      return false;
    end if;
    return strpos(lower(v_actual_text), lower(v_expected_text)) > 0;
  elsif p_operator in ('greater_than', 'less_than') then
    if v_actual_text !~ '^-?[0-9]+(?:\.[0-9]+)?$'
       or v_expected_text !~ '^-?[0-9]+(?:\.[0-9]+)?$' then
      return false;
    end if;
    if p_operator = 'greater_than' then
      return v_actual_text::numeric > v_expected_text::numeric;
    end if;
    return v_actual_text::numeric < v_expected_text::numeric;
  end if;

  return false;
end;
$$;

create or replace function private.funnel_condition_group_is_valid(
  p_group jsonb,
  p_field_keys text[],
  p_variable_keys text[]
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_condition jsonb;
  v_source text;
  v_key text;
  v_operator text;
begin
  if p_group is null
     or jsonb_typeof(p_group) <> 'object'
     or p_group->>'operator' not in ('and', 'or')
     or jsonb_typeof(p_group->'conditions') <> 'array'
     or jsonb_array_length(p_group->'conditions') not between 1 and 50 then
    return false;
  end if;

  for v_condition in select value from jsonb_array_elements(p_group->'conditions')
  loop
    if jsonb_typeof(v_condition) <> 'object' then
      return false;
    end if;

    v_source := v_condition->>'source';
    v_key := coalesce(v_condition->>'key', '');
    v_operator := v_condition->>'operator';

    if v_source not in ('answer', 'variable', 'score', 'utm')
       or v_operator not in (
         'equals', 'not_equals', 'contains', 'greater_than', 'less_than',
         'is_empty', 'is_not_empty'
       )
       or nullif(v_condition->>'id', '') is null
       or char_length(v_condition->>'id') > 160 then
      return false;
    end if;

    if v_source = 'answer' and not (v_key = any(coalesce(p_field_keys, array[]::text[]))) then
      return false;
    elsif v_source = 'variable'
      and not (
        v_key = any(coalesce(p_variable_keys, array[]::text[]))
        or v_key = any(coalesce(p_field_keys, array[]::text[]))
        or (
          v_key like 'answer.%'
          and substring(v_key from 8)
            = any(coalesce(p_field_keys, array[]::text[]))
        )
        or v_key in (
          'lead.first_name', 'lead.email', 'lead.phone', 'lead.score',
          'system.score', 'system.result', 'system.current_page',
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
        )
      ) then
      return false;
    elsif v_source = 'utm'
      and v_key not in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') then
      return false;
    elsif v_source = 'score' and v_key not in ('', 'score', 'system.score', 'lead.score') then
      return false;
    end if;

    if v_operator not in ('is_empty', 'is_not_empty')
       and (
         not (v_condition ? 'value')
         or jsonb_typeof(v_condition->'value') not in ('string', 'number', 'boolean')
       ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.funnel_evaluate_condition_group(
  p_group jsonb,
  p_answers jsonb,
  p_variables jsonb,
  p_utm jsonb,
  p_score numeric
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_condition jsonb;
  v_source text;
  v_key text;
  v_actual jsonb;
  v_matches boolean;
  v_result boolean;
begin
  if p_group is null
     or jsonb_typeof(p_group) <> 'object'
     or jsonb_typeof(p_group->'conditions') <> 'array'
     or jsonb_array_length(p_group->'conditions') = 0 then
    return false;
  end if;

  v_result := p_group->>'operator' = 'and';
  for v_condition in select value from jsonb_array_elements(p_group->'conditions')
  loop
    v_source := v_condition->>'source';
    v_key := coalesce(v_condition->>'key', '');
    v_actual := case v_source
      when 'score' then to_jsonb(coalesce(p_score, 0))
      when 'utm' then coalesce(p_utm->v_key, p_variables->v_key, p_answers->v_key)
      when 'variable' then case
        when v_key like 'answer.%' then p_answers->substring(v_key from 8)
        else coalesce(p_variables->v_key, p_answers->v_key)
      end
      else p_answers->v_key
    end;
    v_matches := private.funnel_compare_value(
      v_actual,
      v_condition->>'operator',
      v_condition->'value'
    );

    if p_group->>'operator' = 'and' and not v_matches then
      return false;
    elsif p_group->>'operator' = 'or' and v_matches then
      return true;
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function private.funnel_values_match_snapshot(
  p_snapshot jsonb,
  p_values jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select private.funnel_jsonb_object_within_limits(p_values, 262144, 250, 128)
    and not exists (
      select 1
      from jsonb_each(p_values) value_entry
      where octet_length(value_entry.value::text) > 32768
        or jsonb_typeof(value_entry.value) not in (
          'string', 'number', 'boolean', 'null', 'array'
        )
        or (
          jsonb_typeof(value_entry.value) = 'array'
          and (
            jsonb_array_length(value_entry.value) > 100
            or exists (
              select 1
              from jsonb_array_elements(value_entry.value) array_value
              where jsonb_typeof(array_value) not in (
                'string', 'number', 'boolean', 'null'
              )
            )
          )
        )
    )
    and not exists (
      select 1
      from jsonb_object_keys(p_values) value_key
      where value_key not in (
          'lead.first_name', 'lead.email', 'lead.phone',
          'system.score', 'system.result'
        )
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
          where element->>'type' in (
              'short_text', 'email', 'phone', 'number', 'date', 'select',
              'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
            )
            and element->'content'->>'fieldKey' = value_key
        )
    );
$$;

create or replace function private.calculate_funnel_snapshot_score(
  p_snapshot jsonb,
  p_answers jsonb,
  p_utm jsonb
)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_element jsonb;
  v_rule jsonb;
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_variables jsonb := '{}'::jsonb;
  v_answer jsonb;
  v_field_key text;
  v_score numeric := 0;
  v_points numeric;
begin
  select coalesce(jsonb_object_agg(
    variable->>'key',
    coalesce(variable->'value', 'null'::jsonb)
  ), '{}'::jsonb)
  into v_variables
  from jsonb_array_elements(coalesce(p_snapshot->'variables', '[]'::jsonb)) variable;
  v_variables := v_variables || coalesce(p_answers, '{}'::jsonb);

  for v_element in
    select value from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
  loop
    if jsonb_typeof(v_element#>'{logic,scoring}') <> 'array' then
      continue;
    end if;
    v_field_key := coalesce(nullif(v_element->'content'->>'fieldKey', ''), v_element->>'id');
    v_answer := p_answers->v_field_key;

    for v_rule in select value from jsonb_array_elements(v_element#>'{logic,scoring}')
    loop
      v_points := (v_rule->>'points')::numeric;
      if (
        not (v_rule ? 'value')
        and not private.funnel_value_is_empty(v_answer)
      ) or (
        v_rule ? 'value'
        and (
          (jsonb_typeof(v_answer) = 'array' and exists (
            select 1
            from jsonb_array_elements(v_answer) answer_item
            where private.funnel_scalar_equals(answer_item, v_rule->'value')
          ))
          or (
            jsonb_typeof(v_answer) <> 'array'
            and private.funnel_scalar_equals(v_answer, v_rule->'value')
          )
        )
      ) then
        v_score := v_score + v_points;
      end if;
    end loop;
  end loop;

  if jsonb_typeof(v_flow->'scoringRules') = 'array' then
    for v_rule in select value from jsonb_array_elements(v_flow->'scoringRules')
    loop
      v_points := (v_rule->>'points')::numeric;
      if private.funnel_evaluate_condition_group(
        v_rule->'condition',
        p_answers,
        v_variables,
        p_utm,
        v_score
      ) then
        v_score := v_score + v_points;
      end if;
    end loop;
  end if;

  return v_score;
end;
$$;

create or replace function private.resolve_funnel_snapshot_result(
  p_snapshot jsonb,
  p_answers jsonb,
  p_utm jsonb,
  p_score numeric
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_connections jsonb := coalesce(v_flow->'connections', '[]'::jsonb);
  v_ranges jsonb := coalesce(v_flow->'resultRanges', '[]'::jsonb);
  v_variables jsonb := '{}'::jsonb;
  v_current_page text;
  v_next_page text;
  v_connection jsonb;
  v_range jsonb;
  v_result_key text;
  v_visited text[] := array[]::text[];
  v_step integer;
begin
  select coalesce(jsonb_object_agg(
    variable->>'key',
    coalesce(variable->'value', 'null'::jsonb)
  ), '{}'::jsonb)
  into v_variables
  from jsonb_array_elements(coalesce(p_snapshot->'variables', '[]'::jsonb)) variable;
  v_variables := v_variables || coalesce(p_answers, '{}'::jsonb);

  v_current_page := nullif(v_flow->>'entryPageId', '');
  if v_current_page is null then
    select page->>'id' into v_current_page
    from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
      with ordinality as page_rows(page, ordinal)
    order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
    limit 1;
  end if;

  for v_step in 1..200
  loop
    exit when v_current_page is null or v_current_page = any(v_visited);
    v_visited := array_append(v_visited, v_current_page);
    v_next_page := null;

    select connection into v_connection
    from jsonb_array_elements(v_connections)
      with ordinality as connection_rows(connection, ordinal)
    where connection->>'sourcePageId' = v_current_page
      and coalesce(connection->'isDefault', 'false'::jsonb) <> 'true'::jsonb
      and private.funnel_evaluate_condition_group(
        connection->'condition',
        p_answers,
        v_variables,
        p_utm,
        p_score
      )
    order by coalesce((connection->>'priority')::numeric, 0), ordinal
    limit 1;
    if found then
      v_current_page := v_connection->>'targetPageId';
      continue;
    end if;

    select result_range into v_range
    from jsonb_array_elements(v_ranges)
      with ordinality as range_rows(result_range, ordinal)
    where result_range->>'sourcePageId' = v_current_page
      and (
        not (result_range ? 'minScore')
        or p_score >= (result_range->>'minScore')::numeric
      )
      and (
        not (result_range ? 'maxScore')
        or p_score <= (result_range->>'maxScore')::numeric
      )
    order by ordinal
    limit 1;
    if found then
      v_result_key := coalesce(
        nullif(v_range->>'resultKey', ''),
        nullif(v_range->>'label', '')
      );
      v_current_page := v_range->>'targetPageId';
      continue;
    end if;

    select connection->>'targetPageId' into v_next_page
    from jsonb_array_elements(v_connections)
      with ordinality as connection_rows(connection, ordinal)
    where connection->>'sourcePageId' = v_current_page
      and connection->'isDefault' = 'true'::jsonb
    order by ordinal
    limit 1;

    if v_next_page is null and not (v_flow ? 'connections') then
      select ordered_pages.page->>'id' into v_next_page
      from (
        select page, row_number() over (
          order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
        ) as row_num
        from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
          with ordinality as page_rows(page, ordinal)
      ) ordered_pages
      where ordered_pages.row_num = (
        select current_position.row_num + 1
        from (
          select page->>'id' as page_id, row_number() over (
            order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
          ) as row_num
          from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
            with ordinality as current_rows(page, ordinal)
        ) current_position
        where current_position.page_id = v_current_page
      )
      limit 1;
    end if;

    exit when v_next_page is null;
    v_current_page := v_next_page;
  end loop;

  return v_result_key;
end;
$$;

create or replace function private.filter_funnel_snapshot_values(
  p_snapshot jsonb,
  p_values jsonb,
  p_page_ids text[]
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(value_entry.key, value_entry.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_values, '{}'::jsonb)) value_entry
  where exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
    where element->>'type' in (
        'short_text', 'email', 'phone', 'number', 'date', 'select',
        'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
      )
      and element->'content'->>'fieldKey' = value_entry.key
      and element->>'pageId' = any(coalesce(p_page_ids, array[]::text[]))
  );
$$;

create or replace function private.resolve_funnel_snapshot_path(
  p_snapshot jsonb,
  p_answers jsonb,
  p_utm jsonb,
  p_stop_page_id text
)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_connections jsonb;
  v_ranges jsonb;
  v_variables jsonb := '{}'::jsonb;
  v_filtered_answers jsonb := '{}'::jsonb;
  v_visible_answers jsonb := '{}'::jsonb;
  v_queue jsonb := '[]'::jsonb;
  v_candidate jsonb;
  v_neighbors jsonb;
  v_current_page text;
  v_next_page text;
  v_neighbor text;
  v_connection jsonb;
  v_range jsonb;
  v_path text[] := array[]::text[];
  v_score numeric := 0;
  v_expanded integer := 0;
  v_visibility_pass integer;
  v_visibility_converged boolean;
begin
  if v_flow ? 'connections' then
    v_connections := v_flow->'connections';
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', 'linear:' || page_id || ':' || next_page_id,
        'sourcePageId', page_id,
        'targetPageId', next_page_id,
        'isDefault', true,
        'priority', 0
      ) order by row_num
    ), '[]'::jsonb)
    into v_connections
    from (
      select page_id, row_num, lead(page_id) over (order by row_num) as next_page_id
      from (
        select page->>'id' as page_id,
          row_number() over (
            order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
          ) as row_num
        from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
          with ordinality as page_rows(page, ordinal)
      ) ordered_pages
    ) linear_pages
    where next_page_id is not null;
  end if;
  v_ranges := coalesce(v_flow->'resultRanges', '[]'::jsonb);

  v_current_page := nullif(v_flow->>'entryPageId', '');
  if v_current_page is null then
    select page->>'id' into v_current_page
    from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
      with ordinality as page_rows(page, ordinal)
    order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
    limit 1;
  end if;

  if p_stop_page_id is not null and not exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb)) page
    where page->>'id' = p_stop_page_id
  ) then
    raise exception using errcode = '22023', message = 'Submission page is not part of the pinned funnel snapshot';
  end if;

  v_queue := jsonb_build_array(jsonb_build_array(v_current_page));
  while jsonb_array_length(v_queue) > 0
  loop
    v_expanded := v_expanded + 1;
    if v_expanded > 2000 then
      raise exception using errcode = '23514', message = 'Submitted funnel path search exceeds its safety limit';
    end if;

    v_candidate := v_queue->0;
    v_queue := v_queue - 0;
    select coalesce(array_agg(page_id order by ordinal), array[]::text[])
    into v_path
    from jsonb_array_elements_text(v_candidate)
      with ordinality as candidate_pages(page_id, ordinal);
    v_current_page := v_path[cardinality(v_path)];

    if p_stop_page_id is not null and v_current_page = p_stop_page_id then
      return v_path;
    end if;

    v_filtered_answers := private.filter_funnel_snapshot_values(
      p_snapshot, p_answers, v_path
    );
    -- Visibility pruning is monotonic: once an answer is no longer attached
    -- to an effectively visible field on this path, it cannot branch or score.
    v_visibility_converged := false;
    for v_visibility_pass in 1..250
    loop
      v_score := private.calculate_funnel_snapshot_score(
        p_snapshot, v_filtered_answers, p_utm
      );
      select coalesce(
        jsonb_object_agg(answer_entry.key, answer_entry.value),
        '{}'::jsonb
      )
      into v_visible_answers
      from jsonb_each(v_filtered_answers) answer_entry
      where exists (
        select 1
        from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
        where element->'content'->>'fieldKey' = answer_entry.key
          and private.funnel_snapshot_element_is_visible(
            p_snapshot,
            element->>'id',
            v_filtered_answers || jsonb_build_object('system.score', v_score),
            p_utm,
            v_score
          )
      );
      if v_visible_answers = v_filtered_answers then
        v_visibility_converged := true;
        exit;
      end if;
      v_filtered_answers := v_visible_answers;
    end loop;
    if not v_visibility_converged then
      raise exception using errcode = '23514', message = 'Answer visibility pruning exceeds its safety limit';
    end if;
    v_score := private.calculate_funnel_snapshot_score(
      p_snapshot, v_filtered_answers, p_utm
    );
    select coalesce(jsonb_object_agg(
      variable->>'key', coalesce(variable->'value', 'null'::jsonb)
    ), '{}'::jsonb)
    into v_variables
    from jsonb_array_elements(coalesce(p_snapshot->'variables', '[]'::jsonb)) variable;
    v_variables := v_variables || v_filtered_answers;
    v_next_page := null;

    select connection into v_connection
    from jsonb_array_elements(v_connections)
      with ordinality as connection_rows(connection, ordinal)
    where connection->>'sourcePageId' = v_current_page
      and coalesce(connection->'isDefault', 'false'::jsonb) <> 'true'::jsonb
      and private.funnel_evaluate_condition_group(
        connection->'condition',
        v_filtered_answers,
        v_variables,
        p_utm,
        v_score
      )
    order by coalesce((connection->>'priority')::numeric, 0), ordinal
    limit 1;
    if found then
      v_next_page := v_connection->>'targetPageId';
    else
      select result_range into v_range
      from jsonb_array_elements(v_ranges)
        with ordinality as range_rows(result_range, ordinal)
      where result_range->>'sourcePageId' = v_current_page
        and (not (result_range ? 'minScore') or v_score >= (result_range->>'minScore')::numeric)
        and (not (result_range ? 'maxScore') or v_score <= (result_range->>'maxScore')::numeric)
      order by ordinal
      limit 1;
      if found then
        v_next_page := v_range->>'targetPageId';
      else
        select connection->>'targetPageId' into v_next_page
        from jsonb_array_elements(v_connections)
          with ordinality as connection_rows(connection, ordinal)
        where connection->>'sourcePageId' = v_current_page
          and connection->'isDefault' = 'true'::jsonb
        order by ordinal
        limit 1;
      end if;
    end if;

    -- Direct page actions are legitimate alternate edges. A bounded BFS lets
    -- the database accept any structurally valid action path to the submitted
    -- page while flow-condition edges remain deterministic for the answers
    -- accumulated along each candidate path.
    select coalesce(jsonb_agg(target_id order by target_id), '[]'::jsonb)
    into v_neighbors
    from (
      select distinct target_page.id as target_id
      from (
        select element#>>'{content,target}' as raw_target
        from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
        where element->>'pageId' = v_current_page
          and element->>'type' in ('button', 'cta')
          and element#>>'{content,action}' = 'go_to_page'
        union
        select action->>'target'
        from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(element#>'{logic,actions}') = 'array'
              then element#>'{logic,actions}'
            else '[]'::jsonb
          end
        ) action
        where element->>'pageId' = v_current_page
          and element->>'type' in ('button', 'cta')
          and case
            when jsonb_typeof(element#>'{logic,actions}') = 'array'
              then jsonb_array_length(element#>'{logic,actions}') = 1
            else false
          end
          and nullif(element#>>'{content,action}', '') is null
          and action->>'type' = 'go_to_page'
          and action->>'trigger' = 'click'
      ) action_target
      join lateral (
        select page->>'id' as id
        from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb)) page
        where page->>'id' = action_target.raw_target
           or page->>'slug' = action_target.raw_target
        limit 1
      ) target_page on true
      where action_target.raw_target is not null
      union
      select v_next_page where v_next_page is not null
    ) candidate_targets;

    if jsonb_array_length(v_neighbors) = 0 then
      if p_stop_page_id is null then
        return v_path;
      end if;
      continue;
    end if;

    for v_neighbor in select value from jsonb_array_elements_text(v_neighbors)
    loop
      if v_neighbor = any(v_path) then
        continue;
      end if;
      if p_stop_page_id is not null and v_neighbor = p_stop_page_id then
        return array_append(v_path, v_neighbor);
      end if;
      if cardinality(v_path) >= 200 or jsonb_array_length(v_queue) >= 2000 then
        raise exception using errcode = '23514', message = 'Submitted funnel path search exceeds its safety limit';
      end if;
      v_queue := v_queue || jsonb_build_array(
        v_candidate || jsonb_build_array(v_neighbor)
      );
    end loop;
  end loop;

  raise exception using errcode = '23514', message = 'Submission page is not reachable for the supplied answers';
end;
$$;

revoke execute on function private.funnel_value_is_empty(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_scalar_equals(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_compare_value(jsonb, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_condition_group_is_valid(jsonb, text[], text[])
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_evaluate_condition_group(jsonb, jsonb, jsonb, jsonb, numeric)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_values_match_snapshot(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.calculate_funnel_snapshot_score(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.resolve_funnel_snapshot_result(jsonb, jsonb, jsonb, numeric)
  from public, anon, authenticated, service_role;
revoke execute on function private.filter_funnel_snapshot_values(jsonb, jsonb, text[])
  from public, anon, authenticated, service_role;
revoke execute on function private.resolve_funnel_snapshot_path(jsonb, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function private.is_safe_funnel_script_url(p_url text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_url is not null
    and char_length(p_url) between 12 and 2048
    and p_url ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z0-9-]+(?::443)?(?:[/?#][^[:space:]]*)?$'
    and position('@' in p_url) = 0
    and position(chr(92) in p_url) = 0
    and lower(p_url) !~ '^https://(?:localhost|[^/:]+\.(?:localhost|local|internal|test|home|lan))(?::[0-9]+)?(?:[/?#]|$)'
    and lower(p_url) !~ '^https://(?:0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)(?:[^/:]*)(?::[0-9]+)?(?:[/?#]|$)'
    and lower(p_url) !~ '^https://(?:metadata|metadata\.google\.internal)(?::[0-9]+)?(?:[/?#]|$)'
    and lower(p_url) !~ '^https://[0-9]+(?:\.[0-9]+){0,3}(?::[0-9]+)?(?:[/?#]|$)';
$$;

create or replace function private.funnel_visibility_group_is_valid(
  p_group jsonb,
  p_field_keys text[],
  p_variable_keys text[]
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_condition jsonb;
  v_variable text;
  v_answer_key text;
  v_operator text;
begin
  if p_group is null
     or jsonb_typeof(p_group) <> 'object'
     or p_group->>'operator' not in ('and', 'or')
     or jsonb_typeof(p_group->'conditions') <> 'array'
     or jsonb_array_length(p_group->'conditions') not between 1 and 50 then
    return false;
  end if;

  for v_condition in select value from jsonb_array_elements(p_group->'conditions')
  loop
    if jsonb_typeof(v_condition) <> 'object' then
      return false;
    end if;

    v_variable := coalesce(v_condition->>'variable', '');
    v_operator := v_condition->>'operator';
    v_answer_key := case
      when v_variable like 'answer.%' then substring(v_variable from 8)
      else v_variable
    end;

    if nullif(v_condition->>'id', '') is null
       or char_length(v_condition->>'id') > 160
       or char_length(v_variable) not between 1 and 128
       or v_variable !~ '^[A-Za-z][A-Za-z0-9_.-]*$'
       or v_operator not in (
         'equals', 'not_equals', 'contains', 'greater_than', 'less_than',
         'is_empty', 'is_not_empty'
       ) then
      return false;
    end if;

    if not (
      v_answer_key = any(coalesce(p_field_keys, array[]::text[]))
      or v_variable = any(coalesce(p_variable_keys, array[]::text[]))
      or v_variable in (
        'lead.first_name', 'lead.email', 'lead.phone', 'lead.score',
        'system.score', 'system.result', 'system.current_page',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
      )
    ) then
      return false;
    end if;

    if v_operator not in ('is_empty', 'is_not_empty')
       and (
         not (v_condition ? 'value')
         or jsonb_typeof(v_condition->'value') not in (
           'string', 'number', 'boolean'
         )
       ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.funnel_visibility_group_matches(
  p_group jsonb,
  p_answers jsonb,
  p_variables jsonb,
  p_utm jsonb,
  p_score numeric,
  p_current_page text
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_condition jsonb;
  v_variable text;
  v_actual jsonb;
  v_matches boolean;
begin
  if p_group is null or jsonb_typeof(p_group) <> 'object' then
    return true;
  end if;

  for v_condition in select value from jsonb_array_elements(p_group->'conditions')
  loop
    v_variable := v_condition->>'variable';
    v_actual := case
      when v_variable like 'answer.%'
        then p_answers->substring(v_variable from 8)
      when v_variable in ('score', 'lead.score', 'system.score')
        then to_jsonb(coalesce(p_score, 0))
      when v_variable = 'system.current_page'
        then to_jsonb(coalesce(p_current_page, ''))
      when v_variable = 'system.result'
        then p_variables->v_variable
      when v_variable like 'utm_%'
        then coalesce(p_utm->v_variable, p_variables->v_variable)
      else coalesce(p_answers->v_variable, p_variables->v_variable)
    end;
    v_matches := private.funnel_compare_value(
      v_actual,
      v_condition->>'operator',
      v_condition->'value'
    );

    if p_group->>'operator' = 'and' and not v_matches then
      return false;
    elsif p_group->>'operator' = 'or' and v_matches then
      return true;
    end if;
  end loop;

  return p_group->>'operator' = 'and';
end;
$$;

create or replace function private.funnel_snapshot_element_is_visible(
  p_snapshot jsonb,
  p_element_id text,
  p_answers jsonb,
  p_utm jsonb,
  p_score numeric
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_element jsonb;
  v_variables jsonb := '{}'::jsonb;
  v_page_name text := '';
  v_parent_id text;
  v_seen text[] := array[]::text[];
  v_first_short_text jsonb;
  v_first_email jsonb;
  v_first_phone jsonb;
begin
  select coalesce(jsonb_object_agg(
    variable->>'key', coalesce(variable->'value', 'null'::jsonb)
  ), '{}'::jsonb)
  into v_variables
  from jsonb_array_elements(coalesce(p_snapshot->'variables', '[]'::jsonb)) variable;
  select p_answers->(element->'content'->>'fieldKey') into v_first_short_text
  from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'short_text'
  order by ordinal
  limit 1;
  select p_answers->(element->'content'->>'fieldKey') into v_first_email
  from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'email'
  order by ordinal
  limit 1;
  select p_answers->(element->'content'->>'fieldKey') into v_first_phone
  from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'phone'
  order by ordinal
  limit 1;

  v_variables := v_variables
    || coalesce(p_answers, '{}'::jsonb)
    || jsonb_build_object(
      'lead.first_name', to_jsonb(coalesce(
        nullif(p_answers->>'lead.first_name', ''),
        nullif(p_answers->>'nome', ''),
        nullif(p_answers->>'name', ''),
        nullif(v_first_short_text #>> '{}', ''),
        nullif(v_variables->>'lead.first_name', '')
      )),
      'lead.email', to_jsonb(coalesce(
        nullif(p_answers->>'lead.email', ''),
        nullif(p_answers->>'email', ''),
        nullif(v_first_email #>> '{}', ''),
        nullif(v_variables->>'lead.email', '')
      )),
      'lead.phone', to_jsonb(coalesce(
        nullif(p_answers->>'lead.phone', ''),
        nullif(p_answers->>'telefone', ''),
        nullif(p_answers->>'phone', ''),
        nullif(v_first_phone #>> '{}', ''),
        nullif(v_variables->>'lead.phone', '')
      )),
      'lead.score', to_jsonb(coalesce(p_score, 0)),
      'system.score', to_jsonb(coalesce(p_score, 0))
    );

  select element into v_element
  from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
  where element->>'id' = p_element_id
  limit 1;
  if not found then
    return false;
  end if;

  select coalesce(page->>'name', '') into v_page_name
  from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb)) page
  where page->>'id' = v_element->>'pageId'
  limit 1;

  loop
    if v_element->>'id' = any(v_seen) then
      return false;
    end if;
    v_seen := array_append(v_seen, v_element->>'id');

    if v_element#>'{logic,visibility}' is not null
       and not private.funnel_visibility_group_matches(
         v_element#>'{logic,visibility}',
         p_answers,
         v_variables,
         p_utm,
         p_score,
         v_page_name
       ) then
      return false;
    end if;

    v_parent_id := nullif(v_element->>'parentId', '');
    exit when v_parent_id is null;
    select parent into v_element
    from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) parent
    where parent->>'id' = v_parent_id
    limit 1;
    if not found then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.funnel_snapshot_element_is_unconditionally_visible(
  p_snapshot jsonb,
  p_element_id text
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_element jsonb;
  v_parent_id text;
  v_seen text[] := array[]::text[];
begin
  select element into v_element
  from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
  where element->>'id' = p_element_id
  limit 1;
  if not found then
    return false;
  end if;

  loop
    if v_element->>'id' = any(v_seen) then
      return false;
    end if;
    v_seen := array_append(v_seen, v_element->>'id');

    if v_element#>'{logic,visibility}' is not null then
      return false;
    end if;

    v_parent_id := nullif(v_element->>'parentId', '');
    exit when v_parent_id is null;
    select parent into v_element
    from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) parent
    where parent->>'id' = v_parent_id
    limit 1;
    if not found then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke execute on function private.funnel_snapshot_element_is_unconditionally_visible(jsonb, text)
  from public, anon, authenticated, service_role;

-- Re-declare scoring after the visibility helpers exist. Score is calculated
-- to a stable visibility fixed point so hidden fields (including fields inside
-- hidden containers) cannot keep contributing stale points.
create or replace function private.calculate_funnel_snapshot_score(
  p_snapshot jsonb,
  p_answers jsonb,
  p_utm jsonb
)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_element jsonb;
  v_rule jsonb;
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_variables jsonb := '{}'::jsonb;
  v_visibility_answers jsonb;
  v_answer jsonb;
  v_field_key text;
  v_score numeric := 0;
  v_visibility_score numeric := 0;
  v_two_steps_ago numeric;
  v_points numeric;
  v_iteration integer;
begin
  for v_iteration in 1..10
  loop
    v_score := 0;
    select coalesce(jsonb_object_agg(
      variable->>'key', coalesce(variable->'value', 'null'::jsonb)
    ), '{}'::jsonb)
    into v_variables
    from jsonb_array_elements(coalesce(p_snapshot->'variables', '[]'::jsonb)) variable;
    v_variables := v_variables || coalesce(p_answers, '{}'::jsonb);
    v_visibility_answers := coalesce(p_answers, '{}'::jsonb)
      || jsonb_build_object('system.score', v_visibility_score);

    for v_element in
      select value from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
    loop
      if jsonb_typeof(v_element#>'{logic,scoring}') <> 'array'
         or not private.funnel_snapshot_element_is_visible(
           p_snapshot,
           v_element->>'id',
           v_visibility_answers,
           p_utm,
           v_visibility_score
         ) then
        continue;
      end if;
      v_field_key := coalesce(
        nullif(v_element->'content'->>'fieldKey', ''), v_element->>'id'
      );
      v_answer := p_answers->v_field_key;

      for v_rule in select value from jsonb_array_elements(v_element#>'{logic,scoring}')
      loop
        v_points := (v_rule->>'points')::numeric;
        if (
          not (v_rule ? 'value')
          and not private.funnel_value_is_empty(v_answer)
        ) or (
          v_rule ? 'value'
          and (
            (jsonb_typeof(v_answer) = 'array' and exists (
              select 1
              from jsonb_array_elements(v_answer) answer_item
              where private.funnel_scalar_equals(answer_item, v_rule->'value')
            ))
            or (
              jsonb_typeof(v_answer) <> 'array'
              and private.funnel_scalar_equals(v_answer, v_rule->'value')
            )
          )
        ) then
          v_score := v_score + v_points;
        end if;
      end loop;
    end loop;

    if jsonb_typeof(v_flow->'scoringRules') = 'array' then
      for v_rule in select value from jsonb_array_elements(v_flow->'scoringRules')
      loop
        v_points := (v_rule->>'points')::numeric;
        if private.funnel_evaluate_condition_group(
          v_rule->'condition',
          p_answers,
          v_variables,
          p_utm,
          v_score
        ) then
          v_score := v_score + v_points;
        end if;
      end loop;
    end if;

    if v_score = v_visibility_score then
      return v_score;
    end if;
    if v_two_steps_ago is not null and v_score = v_two_steps_ago then
      raise exception using errcode = '23514', message = 'Score-dependent visibility does not converge';
    end if;
    v_two_steps_ago := v_visibility_score;
    v_visibility_score := v_score;
  end loop;

  raise exception using errcode = '23514', message = 'Score-dependent visibility exceeds its convergence limit';
end;
$$;

create or replace function private.prune_funnel_snapshot_values_with_result(
  p_snapshot jsonb,
  p_values jsonb,
  p_page_ids text[],
  p_utm jsonb,
  p_result_key text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_values jsonb := private.filter_funnel_snapshot_values(
    p_snapshot, p_values, p_page_ids
  );
  v_visible_values jsonb;
  v_visibility_values jsonb;
  v_score numeric;
  v_pass integer;
begin
  -- This helper intentionally treats the result selected by earlier path
  -- transitions as fixed. The path resolver uses it one prefix at a time,
  -- which avoids applying a later page's score retroactively to an earlier
  -- result decision and avoids recursion through the general pruning helper.
  for v_pass in 1..250
  loop
    v_score := private.calculate_funnel_snapshot_score(
      p_snapshot,
      v_values || jsonb_build_object('system.result', p_result_key),
      p_utm
    );
    v_visibility_values := v_values || jsonb_build_object(
      'system.score', v_score,
      'system.result', p_result_key
    );

    select coalesce(
      jsonb_object_agg(answer_entry.key, answer_entry.value),
      '{}'::jsonb
    )
    into v_visible_values
    from jsonb_each(v_values) answer_entry
    where exists (
      select 1
      from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
      where element->'content'->>'fieldKey' = answer_entry.key
        and element->>'pageId' = any(coalesce(p_page_ids, array[]::text[]))
        and private.funnel_snapshot_element_is_visible(
          p_snapshot,
          element->>'id',
          v_visibility_values,
          p_utm,
          v_score
        )
    );

    if v_visible_values = v_values then
      return v_values;
    end if;
    v_values := v_visible_values;
  end loop;

  raise exception using errcode = '23514', message = 'Answer visibility pruning exceeds its safety limit';
end;
$$;

revoke execute on function private.prune_funnel_snapshot_values_with_result(jsonb, jsonb, text[], jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function private.resolve_funnel_snapshot_result_for_path(
  p_snapshot jsonb,
  p_answers jsonb,
  p_utm jsonb,
  p_page_path text[]
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_ranges jsonb := coalesce(v_flow->'resultRanges', '[]'::jsonb);
  v_source_page_id text;
  v_target_page_id text;
  v_prefix text[];
  v_prefix_values jsonb;
  v_prefix_score numeric;
  v_range jsonb;
  v_result_key text;
  v_index integer;
begin
  if p_page_path is null or cardinality(p_page_path) < 2 then
    return null;
  end if;

  -- A result range is authoritative only when its concrete source -> target
  -- transition is present in the browser path later validated by the server.
  -- This prevents a deterministic default branch from assigning a result to a
  -- visitor who used a visible direct-action edge instead.
  for v_index in 1..(cardinality(p_page_path) - 1)
  loop
    v_source_page_id := p_page_path[v_index];
    v_target_page_id := p_page_path[v_index + 1];
    v_prefix := p_page_path[1:v_index];
    v_prefix_values := private.prune_funnel_snapshot_values_with_result(
      p_snapshot, p_answers, v_prefix, p_utm, v_result_key
    );
    v_prefix_score := private.calculate_funnel_snapshot_score(
      p_snapshot,
      v_prefix_values || jsonb_build_object('system.result', v_result_key),
      p_utm
    );

    select result_range into v_range
    from jsonb_array_elements(v_ranges)
      with ordinality as range_rows(result_range, ordinal)
    where result_range->>'sourcePageId' = v_source_page_id
      and result_range->>'targetPageId' = v_target_page_id
      and (not (result_range ? 'minScore') or v_prefix_score >= (result_range->>'minScore')::numeric)
      and (not (result_range ? 'maxScore') or v_prefix_score <= (result_range->>'maxScore')::numeric)
    order by ordinal
    limit 1;

    if found then
      v_result_key := coalesce(
        nullif(v_range->>'resultKey', ''),
        nullif(v_range->>'label', '')
      );
    end if;
  end loop;

  return v_result_key;
end;
$$;

revoke execute on function private.resolve_funnel_snapshot_result_for_path(jsonb, jsonb, jsonb, text[])
  from public, anon, authenticated, service_role;

create or replace function private.prune_funnel_snapshot_values(
  p_snapshot jsonb,
  p_values jsonb,
  p_page_ids text[],
  p_utm jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_result_key text;
begin
  -- Result decisions are temporal: each edge is evaluated with the answers
  -- available on that path prefix. Once selected, the last result is then the
  -- visibility context for the complete visited path; later answers never
  -- rewrite an earlier range decision.
  v_result_key := private.resolve_funnel_snapshot_result_for_path(
    p_snapshot, p_values, p_utm, p_page_ids
  );
  return private.prune_funnel_snapshot_values_with_result(
    p_snapshot, p_values, p_page_ids, p_utm, v_result_key
  );
end;
$$;

create or replace function private.resolve_funnel_snapshot_flow_next_page(
  p_snapshot jsonb,
  p_current_page_id text,
  p_answers jsonb,
  p_utm jsonb
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_connections jsonb;
  v_ranges jsonb := coalesce(v_flow->'resultRanges', '[]'::jsonb);
  v_variables jsonb := '{}'::jsonb;
  v_connection jsonb;
  v_range jsonb;
  v_score numeric;
  v_next_page text;
begin
  if v_flow ? 'connections' then
    v_connections := v_flow->'connections';
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'sourcePageId', page_id,
        'targetPageId', next_page_id,
        'isDefault', true
      ) order by row_num
    ), '[]'::jsonb)
    into v_connections
    from (
      select page_id, row_num, lead(page_id) over (order by row_num) as next_page_id
      from (
        select page->>'id' as page_id,
          row_number() over (
            order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
          ) as row_num
        from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
          with ordinality as page_rows(page, ordinal)
      ) ordered_pages
    ) linear_pages
    where next_page_id is not null;
  end if;

  v_score := private.calculate_funnel_snapshot_score(
    p_snapshot, p_answers, p_utm
  );
  select coalesce(jsonb_object_agg(
    variable->>'key', coalesce(variable->'value', 'null'::jsonb)
  ), '{}'::jsonb)
  into v_variables
  from jsonb_array_elements(coalesce(p_snapshot->'variables', '[]'::jsonb)) variable;
  v_variables := v_variables || p_answers;

  select connection into v_connection
  from jsonb_array_elements(v_connections)
    with ordinality as connection_rows(connection, ordinal)
  where connection->>'sourcePageId' = p_current_page_id
    and coalesce(connection->'isDefault', 'false'::jsonb) <> 'true'::jsonb
    and private.funnel_evaluate_condition_group(
      connection->'condition', p_answers, v_variables, p_utm, v_score
    )
  order by coalesce((connection->>'priority')::numeric, 0), ordinal
  limit 1;
  if found then
    return v_connection->>'targetPageId';
  end if;

  select result_range into v_range
  from jsonb_array_elements(v_ranges)
    with ordinality as range_rows(result_range, ordinal)
  where result_range->>'sourcePageId' = p_current_page_id
    and (not (result_range ? 'minScore') or v_score >= (result_range->>'minScore')::numeric)
    and (not (result_range ? 'maxScore') or v_score <= (result_range->>'maxScore')::numeric)
  order by ordinal
  limit 1;
  if found then
    return v_range->>'targetPageId';
  end if;

  select connection->>'targetPageId' into v_next_page
  from jsonb_array_elements(v_connections)
    with ordinality as connection_rows(connection, ordinal)
  where connection->>'sourcePageId' = p_current_page_id
    and connection->'isDefault' = 'true'::jsonb
  order by ordinal
  limit 1;
  return v_next_page;
end;
$$;

create or replace function private.validate_funnel_snapshot_page_path(
  p_snapshot jsonb,
  p_answers jsonb,
  p_utm jsonb,
  p_page_path text[]
)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_entry_page_id text;
  v_source_page_id text;
  v_target_page_id text;
  v_target_slug text;
  v_flow_target text;
  v_prefix text[];
  v_prefix_values jsonb;
  v_visibility_values jsonb;
  v_score numeric;
  v_result_key text;
  v_transition_result_key text;
  v_index integer;
  v_action_allowed boolean;
begin
  if p_page_path is null
     or cardinality(p_page_path) not between 1 and 200
     or array_position(p_page_path, null) is not null then
    raise exception using errcode = '22023', message = 'Funnel page path is invalid';
  end if;
  if exists (
    select 1
    from unnest(p_page_path) path_page_id
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb)) page
      where page->>'id' = path_page_id
    )
  ) then
    raise exception using errcode = '22023', message = 'Funnel page path references an unknown page';
  end if;

  v_entry_page_id := coalesce(
    nullif(p_snapshot#>>'{flow,entryPageId}', ''),
    nullif(p_snapshot#>>'{settings,flow,entryPageId}', ''),
    (
      select page->>'id'
      from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb))
        with ordinality as page_rows(page, ordinal)
      order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
      limit 1
    )
  );
  if p_page_path[1] <> v_entry_page_id then
    raise exception using errcode = '23514', message = 'Funnel page path must begin at the published entry page';
  end if;

  if cardinality(p_page_path) > 1 then
    for v_index in 1..(cardinality(p_page_path) - 1)
    loop
      v_source_page_id := p_page_path[v_index];
      v_target_page_id := p_page_path[v_index + 1];
      v_prefix := p_page_path[1:v_index];
      v_prefix_values := private.prune_funnel_snapshot_values_with_result(
        p_snapshot, p_answers, v_prefix, p_utm, v_result_key
      );
      v_score := private.calculate_funnel_snapshot_score(
        p_snapshot,
        v_prefix_values || jsonb_build_object('system.result', v_result_key),
        p_utm
      );
      v_visibility_values := v_prefix_values || jsonb_build_object(
        'system.score', v_score,
        'system.result', v_result_key
      );
      v_flow_target := private.resolve_funnel_snapshot_flow_next_page(
        p_snapshot, v_source_page_id, v_visibility_values, p_utm
      );
      v_action_allowed := v_target_page_id = v_flow_target;
      if not v_action_allowed then
        select page->>'slug' into v_target_slug
        from jsonb_array_elements(coalesce(p_snapshot->'pages', '[]'::jsonb)) page
        where page->>'id' = v_target_page_id
        limit 1;

        select exists (
          select 1
          from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
          where element->>'pageId' = v_source_page_id
            and private.funnel_snapshot_element_is_visible(
              p_snapshot, element->>'id', v_visibility_values, p_utm, v_score
            )
            and (
              (
                element->>'type' in ('button', 'cta')
                and element#>>'{content,action}' = 'go_to_page'
                and element#>>'{content,target}' in (v_target_page_id, v_target_slug)
              )
              or exists (
                select 1
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(element#>'{logic,actions}') = 'array'
                      then element#>'{logic,actions}'
                    else '[]'::jsonb
                  end
                ) action
                where element->>'type' in ('button', 'cta')
                  and case
                    when jsonb_typeof(element#>'{logic,actions}') = 'array'
                      then jsonb_array_length(element#>'{logic,actions}') = 1
                    else false
                  end
                  and nullif(element#>>'{content,action}', '') is null
                  and action->>'type' = 'go_to_page'
                  and action->>'trigger' = 'click'
                  and action->>'target' in (v_target_page_id, v_target_slug)
              )
            )
        ) into v_action_allowed;
      end if;

      if not v_action_allowed then
        raise exception using errcode = '23514', message = 'Funnel page path contains an invalid transition';
      end if;

      v_transition_result_key := null;
      select coalesce(
        nullif(result_range->>'resultKey', ''),
        nullif(result_range->>'label', '')
      )
      into v_transition_result_key
      from jsonb_array_elements(
        coalesce(
          p_snapshot#>'{flow,resultRanges}',
          p_snapshot#>'{settings,flow,resultRanges}',
          '[]'::jsonb
        )
      ) with ordinality as range_rows(result_range, ordinal)
      where result_range->>'sourcePageId' = v_source_page_id
        and result_range->>'targetPageId' = v_target_page_id
        and (not (result_range ? 'minScore') or v_score >= (result_range->>'minScore')::numeric)
        and (not (result_range ? 'maxScore') or v_score <= (result_range->>'maxScore')::numeric)
      order by ordinal
      limit 1;
      if v_transition_result_key is not null then
        v_result_key := v_transition_result_key;
      end if;
    end loop;
  end if;

  return p_page_path;
end;
$$;

revoke execute on function private.resolve_funnel_snapshot_flow_next_page(jsonb, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_funnel_snapshot_page_path(jsonb, jsonb, jsonb, text[])
  from public, anon, authenticated, service_role;

create or replace function private.funnel_snapshot_page_can_submit(
  p_snapshot jsonb,
  p_page_id text,
  p_page_path text[],
  p_answers jsonb,
  p_utm jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_score numeric;
  v_result_key text;
  v_flow_target text;
  v_visibility_values jsonb;
begin
  if p_page_id is null
     or p_page_path is null
     or p_page_path[cardinality(p_page_path)] <> p_page_id then
    return false;
  end if;

  v_result_key := private.resolve_funnel_snapshot_result_for_path(
    p_snapshot, p_answers, p_utm, p_page_path
  );
  v_score := private.calculate_funnel_snapshot_score(
    p_snapshot,
    p_answers || jsonb_build_object('system.result', v_result_key),
    p_utm
  );
  v_visibility_values := p_answers || jsonb_build_object(
    'system.score', v_score,
    'system.result', v_result_key
  );
  v_flow_target := private.resolve_funnel_snapshot_flow_next_page(
    p_snapshot, p_page_id, v_visibility_values, p_utm
  );

  return exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb)) element
    where element->>'pageId' = p_page_id
      and element->>'type' in ('button', 'cta')
      and private.funnel_snapshot_element_is_visible(
        p_snapshot, element->>'id', v_visibility_values, p_utm, v_score
      )
      and (
        coalesce(
          nullif(element#>>'{content,action}', ''),
          nullif(element#>>'{logic,actions,0,type}', ''),
          'next_page'
        ) = 'submit'
        or (
          coalesce(
            nullif(element#>>'{content,action}', ''),
            nullif(element#>>'{logic,actions,0,type}', ''),
            'next_page'
          ) = 'next_page'
          and v_flow_target is null
        )
      )
  );
end;
$$;

revoke execute on function private.funnel_snapshot_page_can_submit(jsonb, text, text[], jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.funnel_answer_value_is_valid(
  p_type text,
  p_content jsonb,
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_text text;
  v_number numeric;
  v_min numeric;
  v_max numeric;
  v_step numeric;
begin
  if private.funnel_value_is_empty(p_value) then
    return true;
  end if;

  if p_type = 'short_text' then
    return jsonb_typeof(p_value) = 'string'
      and char_length(p_value #>> '{}') <= 5000;
  elsif p_type = 'email' then
    v_text := p_value #>> '{}';
    return jsonb_typeof(p_value) = 'string'
      and char_length(v_text) <= 320
      and v_text ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  elsif p_type = 'phone' then
    v_text := p_value #>> '{}';
    return jsonb_typeof(p_value) = 'string'
      and char_length(v_text) <= 64
      and char_length(regexp_replace(v_text, '[^0-9]', '', 'g')) between 10 and 15;
  elsif p_type = 'date' then
    v_text := p_value #>> '{}';
    if jsonb_typeof(p_value) <> 'string'
       or v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return false;
    end if;
    return to_char(v_text::date, 'YYYY-MM-DD') = v_text;
  elsif p_type in ('number', 'slider', 'rating') then
    if jsonb_typeof(p_value) <> 'number' then
      return false;
    end if;
    v_number := (p_value #>> '{}')::numeric;
    if abs(v_number) > 1000000000000000 then
      return false;
    end if;
    v_min := case when jsonb_typeof(p_content->'min') = 'number'
      then (p_content->>'min')::numeric else null end;
    v_max := case when jsonb_typeof(p_content->'max') = 'number'
      then (p_content->>'max')::numeric else null end;
    if (v_min is not null and v_number < v_min)
       or (v_max is not null and v_number > v_max) then
      return false;
    end if;
    if p_type = 'slider' and jsonb_typeof(p_content->'step') = 'number' then
      v_step := (p_content->>'step')::numeric;
      if v_step <= 0 or mod(v_number - coalesce(v_min, 0), v_step) <> 0 then
        return false;
      end if;
    elsif p_type = 'rating' then
      return trunc(v_number) = v_number
        and v_number between 1 and coalesce(v_max, 5);
    end if;
    return true;
  elsif p_type in ('select', 'radio', 'quiz_choice') then
    return jsonb_typeof(p_value) = 'string'
      and exists (
        select 1
        from jsonb_array_elements(p_content->'options') option_value
        where option_value = p_value
      );
  elsif p_type = 'checkbox' then
    return jsonb_typeof(p_value) = 'array'
      and jsonb_array_length(p_value) <= 100
      and not exists (
        select 1
        from jsonb_array_elements(p_value) answer_value
        where jsonb_typeof(answer_value) <> 'string'
          or not exists (
            select 1
            from jsonb_array_elements(p_content->'options') option_value
            where option_value = answer_value
          )
      );
  elsif p_type = 'upload' then
    return jsonb_typeof(p_value) = 'string'
      and char_length(p_value #>> '{}') between 1 and 500;
  end if;

  return false;
exception
  when invalid_datetime_format or datetime_field_overflow
    or invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function private.assert_funnel_snapshot_answers_valid(
  p_snapshot jsonb,
  p_values jsonb,
  p_page_ids text[],
  p_utm jsonb,
  p_funnel_id uuid,
  p_session_key uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_element jsonb;
  v_field_key text;
  v_value jsonb;
  v_score numeric;
  v_upload_path text;
  v_on_path boolean;
  v_visible boolean;
  v_result_key text;
  v_visibility_values jsonb;
begin
  v_result_key := private.resolve_funnel_snapshot_result_for_path(
    p_snapshot, p_values, p_utm, p_page_ids
  );
  v_score := private.calculate_funnel_snapshot_score(
    p_snapshot,
    p_values || jsonb_build_object('system.result', v_result_key),
    p_utm
  );
  v_visibility_values := p_values || jsonb_build_object(
    'system.score', v_score,
    'system.result', v_result_key
  );

  for v_element in
    select value
    from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
    where value->>'type' in (
      'short_text', 'email', 'phone', 'number', 'date', 'select',
      'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
    )
  loop
    v_field_key := v_element->'content'->>'fieldKey';
    v_value := p_values->v_field_key;
    v_on_path := p_page_ids is null
      or v_element->>'pageId' = any(coalesce(p_page_ids, array[]::text[]));
    v_visible := v_on_path and private.funnel_snapshot_element_is_visible(
      p_snapshot, v_element->>'id', v_visibility_values, p_utm, v_score
    );

    if v_visible
       and coalesce(v_element->'content'->'required', 'false'::jsonb) = 'true'::jsonb
       and private.funnel_value_is_empty(v_value) then
      raise exception using
        errcode = '23514',
        message = format('Required funnel field is missing: %s', v_field_key);
    end if;

    if p_values ? v_field_key
       and not private.funnel_answer_value_is_valid(
         v_element->>'type', v_element->'content', v_value
       ) then
      raise exception using
        errcode = '23514',
        message = format('Funnel field has an invalid value: %s', v_field_key);
    end if;

    if p_values ? v_field_key
       and v_element->>'type' = 'upload'
       and not private.funnel_value_is_empty(v_value) then
      v_upload_path := v_value #>> '{}';
      if p_funnel_id is null
         or p_session_key is null
         or strpos(
           v_upload_path,
           p_funnel_id::text || '/' || p_session_key::text || '/'
         ) <> 1
         or not exists (
           select 1
           from storage.objects object_row
           where object_row.bucket_id = 'funnel-uploads'
             and object_row.name = v_upload_path
         ) then
        raise exception using errcode = '23514', message = 'Uploaded response does not belong to this funnel session';
      end if;
    end if;
  end loop;
end;
$$;

create or replace function private.assert_funnel_snapshot_publishable(p_snapshot jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pages jsonb := coalesce(p_snapshot->'pages', '[]'::jsonb);
  v_elements jsonb := coalesce(p_snapshot->'elements', '[]'::jsonb);
  v_variables jsonb := coalesce(p_snapshot->'variables', '[]'::jsonb);
  v_flow jsonb := coalesce(p_snapshot->'flow', p_snapshot#>'{settings,flow}', '{}'::jsonb);
  v_connections jsonb;
  v_ranges jsonb;
  v_scoring_rules jsonb;
  v_page_ids text[];
  v_page_slugs text[];
  v_field_keys text[];
  v_variable_keys text[];
  v_page_id text;
  v_element jsonb;
  v_connection jsonb;
  v_range jsonb;
  v_rule jsonb;
  v_action jsonb;
  v_target text;
  v_default_count integer;
  v_branch_count integer;
  v_range_count integer;
begin
  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'object'
     or p_snapshot->>'schemaVersion' <> '2'
     or octet_length(p_snapshot::text) > 900000
     or jsonb_typeof(v_pages) <> 'array'
     or jsonb_typeof(v_elements) <> 'array'
     or jsonb_typeof(v_variables) <> 'array'
     or jsonb_array_length(v_pages) not between 1 and 100
     or jsonb_array_length(v_elements) > 5000
     or jsonb_array_length(v_variables) > 500 then
    raise exception using errcode = '23514', message = 'Published funnel snapshot has an invalid structure';
  end if;

  if jsonb_typeof(coalesce(p_snapshot->'settings', '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '23514', message = 'Funnel settings must be an object';
  end if;

  if p_snapshot#>'{settings,customScriptUrls}' is not null then
    if jsonb_typeof(p_snapshot#>'{settings,customScriptUrls}') <> 'array'
       or jsonb_array_length(p_snapshot#>'{settings,customScriptUrls}') > 5
       or exists (
         select 1
         from jsonb_array_elements(p_snapshot#>'{settings,customScriptUrls}') script_url
         where jsonb_typeof(script_url) <> 'string'
           or not private.is_safe_funnel_script_url(script_url #>> '{}')
       ) then
      raise exception using errcode = '23514', message = 'Custom scripts require at most five safe public HTTPS URLs';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_pages) page
    where jsonb_typeof(page) <> 'object'
      or coalesce(page->>'id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or nullif(trim(page->>'name'), '') is null
      or char_length(page->>'name') > 160
      or coalesce(page->>'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ) or (
    select count(*) <> count(distinct page->>'id')
    from jsonb_array_elements(v_pages) page
  ) or (
    select count(*) <> count(distinct lower(page->>'slug'))
    from jsonb_array_elements(v_pages) page
  ) then
    raise exception using errcode = '23514', message = 'Published funnel pages are invalid or duplicated';
  end if;

  select coalesce(array_agg(page->>'id'), array[]::text[]),
         coalesce(array_agg(page->>'slug'), array[]::text[])
  into v_page_ids, v_page_slugs
  from jsonb_array_elements(v_pages) page;

  if exists (
    select 1
    from jsonb_array_elements(v_elements) element
    left join lateral (
      select parent
      from jsonb_array_elements(v_elements) parent
      where parent->>'id' = element->>'parentId'
      limit 1
    ) parent_row on true
    where jsonb_typeof(element) <> 'object'
      or coalesce(element->>'id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or not (element->>'pageId' = any(v_page_ids))
      or element->>'type' not in (
        'section', 'container', 'spacer', 'divider', 'heading', 'text',
        'image', 'video', 'button', 'icon', 'embed', 'audio', 'short_text',
        'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio',
        'upload', 'quiz_choice', 'slider', 'rating', 'progress', 'countdown',
        'accordion', 'offer', 'price', 'testimonial', 'faq', 'benefits',
        'cta', 'social_proof', 'logo_cloud'
      )
      or jsonb_typeof(coalesce(element->'content', '{}'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(element->'styles', '{}'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(element->'logic', '{}'::jsonb)) <> 'object'
      or (element->>'type' = 'section' and nullif(element->>'parentId', '') is not null)
      or (
        element->>'type' <> 'section'
        and (
          nullif(element->>'parentId', '') is null
          or parent_row.parent is null
          or parent_row.parent->>'pageId' <> element->>'pageId'
          or parent_row.parent->>'type' not in ('section', 'container')
        )
      )
  ) or (
    select count(*) <> count(distinct element->>'id')
    from jsonb_array_elements(v_elements) element
  ) then
    raise exception using errcode = '23514', message = 'Published funnel element hierarchy is incompatible with the component registry';
  end if;

  -- The parent/type checks above do not, by themselves, reject a group of
  -- containers that point to each other. Walk each ancestor chain and reject
  -- any repeated element id before accepting the immutable snapshot.
  if exists (
    with recursive
    element_rows as (
      select
        element->>'id' as id,
        nullif(element->>'parentId', '') as parent_id,
        element->>'type' as type
      from jsonb_array_elements(v_elements) element
    ),
    ancestor_walk(start_id, id, parent_id, path, has_cycle) as (
      select
        element_row.id,
        element_row.id,
        element_row.parent_id,
        array[element_row.id]::text[],
        false
      from element_rows element_row
      where element_row.type = 'container'
      union all
      select
        walk.start_id,
        parent.id,
        parent.parent_id,
        walk.path || parent.id,
        parent.id = any(walk.path)
      from ancestor_walk walk
      join element_rows parent on parent.id = walk.parent_id
      where not walk.has_cycle
        and cardinality(walk.path) <= 5000
    )
    select 1
    from ancestor_walk
    where has_cycle or cardinality(path) > 5000
  ) then
    raise exception using errcode = '23514', message = 'Published funnel element hierarchy cannot contain a cycle';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_elements) element
    where element->>'type' in (
        'short_text', 'email', 'phone', 'number', 'date', 'select',
        'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
      )
      and (
        coalesce(element->'content'->>'fieldKey', '') !~
          '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'
        or lower(element->'content'->>'fieldKey') = 'score'
        or lower(element->'content'->>'fieldKey') ~
          '^(system\.|lead\.|answer\.|utm_)'
      )
  ) or exists (
    select 1
    from jsonb_array_elements(v_elements) element
    where element->>'type' in (
        'short_text', 'email', 'phone', 'number', 'date', 'select',
        'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
      )
    group by lower(element->'content'->>'fieldKey')
    having count(*) > 1
  ) then
    raise exception using errcode = '23514', message = 'Published response field keys must be valid, unique, and outside reserved namespaces';
  end if;

  select coalesce(array_agg(element->'content'->>'fieldKey'), array[]::text[])
  into v_field_keys
  from jsonb_array_elements(v_elements) element
  where element->>'type' in (
    'short_text', 'email', 'phone', 'number', 'date', 'select',
    'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
  );

  if exists (
    select 1
    from jsonb_array_elements(v_variables) variable
    where jsonb_typeof(variable) <> 'object'
      or coalesce(variable->>'id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(variable->>'key', '') !~ '^[A-Za-z][A-Za-z0-9_.-]{0,127}$'
      or variable->>'kind' not in (
        'answer', 'lead', 'system', 'utm', 'custom', 'computed'
      )
      or (
        variable ? 'label'
        and jsonb_typeof(variable->'label') not in ('string', 'null')
      )
      or char_length(coalesce(variable->>'label', '')) > 160
      or (
        variable ? 'value'
        and jsonb_typeof(variable->'value') not in (
          'string', 'number', 'boolean', 'null'
        )
      )
      or octet_length(coalesce(variable->'value', 'null'::jsonb)::text) > 5000
      or (
        variable ? 'settings'
        and jsonb_typeof(variable->'settings') <> 'object'
      )
      or octet_length(coalesce(variable->'settings', '{}'::jsonb)::text) > 32768
      or (
        variable->>'kind' = 'answer'
        and (
          variable->>'key' not like 'answer.%'
          or not (
            substring(variable->>'key' from 8)
              = any(coalesce(v_field_keys, array[]::text[]))
          )
        )
      )
      or (
        variable->>'kind' = 'lead'
        and variable->>'key' not in (
          'lead.first_name', 'lead.email', 'lead.phone', 'lead.score'
        )
      )
      or (
        variable->>'kind' = 'system'
        and variable->>'key' not in (
          'system.score', 'system.result', 'system.current_page'
        )
      )
      or (
        variable->>'kind' = 'utm'
        and variable->>'key' not in (
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
        )
      )
      or (
        variable->>'kind' in ('custom', 'computed')
        and (
          lower(variable->>'key') = 'score'
          or lower(variable->>'key') ~ '^(system\.|lead\.|answer\.|utm_)'
          or exists (
            select 1
            from unnest(coalesce(v_field_keys, array[]::text[])) field_key
            where lower(field_key) = lower(variable->>'key')
          )
        )
      )
  ) or (
    select count(*) <> count(distinct lower(variable->>'key'))
    from jsonb_array_elements(v_variables) variable
  ) or (
    select count(*) <> count(distinct variable->>'id')
    from jsonb_array_elements(v_variables) variable
  ) then
    raise exception using errcode = '23514', message = 'Published funnel variables are invalid, duplicated, or collide with a reserved namespace';
  end if;

  select coalesce(array_agg(variable->>'key'), array[]::text[])
  into v_variable_keys
  from jsonb_array_elements(v_variables) variable;

  for v_element in select value from jsonb_array_elements(v_elements)
  loop
    if v_element->>'type' not in ('button', 'cta')
       and (
         v_element->'content' ? 'action'
         or v_element->'content' ? 'target'
       ) then
      raise exception using errcode = '23514', message = 'Only a button or CTA may define a content action or target';
    end if;

    if v_element->>'type' in ('button', 'cta') then
      if v_element#>>'{content,action}' not in (
        'next_page', 'previous_page', 'go_to_page', 'submit', 'open_url'
      ) then
        raise exception using errcode = '23514', message = 'Button action is not supported';
      end if;
      if v_element#>>'{content,action}' = 'open_url'
         and not private.is_safe_funnel_script_url(
           nullif(v_element#>>'{content,target}', '')
         ) then
        raise exception using errcode = '23514', message = 'Button URL must be a safe public HTTPS address';
      end if;
    end if;

    if v_element->>'type' in (
         'short_text', 'email', 'phone', 'number', 'date', 'select',
         'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating'
       )
       and v_element->'content' ? 'required'
       and jsonb_typeof(v_element->'content'->'required') <> 'boolean' then
      raise exception using errcode = '23514', message = 'Field required setting must be boolean';
    end if;

    if v_element->>'type' in ('select', 'checkbox', 'radio', 'quiz_choice') then
      if jsonb_typeof(v_element->'content'->'options') is distinct from 'array' then
        raise exception using errcode = '23514', message = 'Choice field options must be an array';
      end if;
      if jsonb_array_length(v_element->'content'->'options') not between 1 and 200
         or exists (
           select 1
           from jsonb_array_elements(v_element->'content'->'options') option_value
           where jsonb_typeof(option_value) <> 'string'
             or char_length(option_value #>> '{}') not between 1 and 500
         )
         or (
           select count(*) <> count(distinct option_value)
           from jsonb_array_elements(v_element->'content'->'options') option_value
         ) then
        raise exception using errcode = '23514', message = 'Choice field options must be non-empty, unique strings';
      end if;
    end if;

    if v_element->>'type' in ('number', 'slider') then
      if (v_element->'content' ? 'min' and jsonb_typeof(v_element->'content'->'min') <> 'number')
         or (v_element->'content' ? 'max' and jsonb_typeof(v_element->'content'->'max') <> 'number') then
        raise exception using errcode = '23514', message = 'Numeric field bounds must be numbers';
      end if;
      if (
           v_element->'content' ? 'min' and v_element->'content' ? 'max'
           and (v_element->'content'->>'min')::numeric > (v_element->'content'->>'max')::numeric
         )
         or abs(coalesce((v_element->'content'->>'min')::numeric, 0)) > 1000000000000000
         or abs(coalesce((v_element->'content'->>'max')::numeric, 0)) > 1000000000000000 then
        raise exception using errcode = '23514', message = 'Numeric field bounds are invalid';
      end if;
    end if;

    if v_element->>'type' = 'slider' then
      if jsonb_typeof(v_element->'content'->'step') is distinct from 'number' then
        raise exception using errcode = '23514', message = 'Slider step must be numeric';
      end if;
      if (v_element->'content'->>'step')::numeric <= 0
         or (v_element->'content'->>'step')::numeric > 1000000000000000 then
        raise exception using errcode = '23514', message = 'Slider step is invalid';
      end if;
    end if;

    if v_element->>'type' = 'rating' then
      if jsonb_typeof(v_element->'content'->'max') is distinct from 'number' then
        raise exception using errcode = '23514', message = 'Rating maximum must be numeric';
      end if;
      if (v_element->'content'->>'max')::numeric not between 1 and 100
         or trunc((v_element->'content'->>'max')::numeric)
           <> (v_element->'content'->>'max')::numeric then
        raise exception using errcode = '23514', message = 'Rating maximum is invalid';
      end if;
    end if;

    if v_element#>'{logic,visibility}' is not null
       and not private.funnel_visibility_group_is_valid(
         v_element#>'{logic,visibility}', v_field_keys, v_variable_keys
       ) then
      raise exception using errcode = '23514', message = 'Element visibility condition is invalid or references an unknown variable';
    end if;

    if v_element#>'{logic,actions}' is not null then
      if jsonb_typeof(v_element#>'{logic,actions}') <> 'array'
         or jsonb_array_length(v_element#>'{logic,actions}') > 1 then
        raise exception using errcode = '23514', message = 'Element actions are invalid';
      end if;
      if jsonb_array_length(v_element#>'{logic,actions}') = 1
         and (
           v_element->>'type' not in ('button', 'cta')
           or nullif(v_element#>>'{content,action}', '') is not null
         ) then
        raise exception using errcode = '23514', message = 'Only a button or CTA without a content action may define one logic action';
      end if;
    end if;

    if v_element#>'{logic,scoring}' is not null then
      if jsonb_typeof(v_element#>'{logic,scoring}') <> 'array'
         or jsonb_array_length(v_element#>'{logic,scoring}') > 100 then
        raise exception using errcode = '23514', message = 'Element scoring rules are invalid';
      end if;
      for v_rule in select value from jsonb_array_elements(v_element#>'{logic,scoring}')
      loop
        if jsonb_typeof(v_rule) <> 'object'
           or nullif(v_rule->>'id', '') is null
           or char_length(v_rule->>'id') > 160
           or jsonb_typeof(v_rule->'points') <> 'number'
           or abs((v_rule->>'points')::numeric) > 1000000000
           or (
             v_rule ? 'value'
             and jsonb_typeof(v_rule->'value') not in ('string', 'number', 'boolean')
           ) then
          raise exception using errcode = '23514', message = 'Element scoring rule is invalid';
        end if;
      end loop;
    end if;

    if v_element#>>'{content,action}' = 'go_to_page' then
      v_target := nullif(v_element#>>'{content,target}', '');
      if v_target is null
         or not (v_target = any(v_page_ids) or v_target = any(v_page_slugs)) then
        raise exception using errcode = '23514', message = 'Element action references an unknown page';
      end if;
    end if;

    if jsonb_typeof(v_element#>'{logic,actions}') = 'array' then
      for v_action in select value from jsonb_array_elements(v_element#>'{logic,actions}')
      loop
        if jsonb_typeof(v_action) <> 'object'
           or nullif(v_action->>'id', '') is null
           or char_length(v_action->>'id') > 160
           or v_action->>'type' not in (
             'next_page', 'previous_page', 'go_to_page', 'submit', 'open_url'
           )
           or v_action->>'trigger' <> 'click' then
          raise exception using errcode = '23514', message = 'Element action is invalid';
        end if;
        if v_action->>'type' = 'go_to_page' then
          v_target := nullif(v_action->>'target', '');
          if v_target is null
             or not (v_target = any(v_page_ids) or v_target = any(v_page_slugs)) then
            raise exception using errcode = '23514', message = 'Element action references an unknown page';
          end if;
        elsif v_action->>'type' = 'open_url'
          and not private.is_safe_funnel_script_url(
            nullif(v_action->>'target', '')
          ) then
          raise exception using errcode = '23514', message = 'Element URL must be a safe public HTTPS address';
        end if;
      end loop;
    end if;
  end loop;

  if jsonb_typeof(v_flow) <> 'object' or octet_length(v_flow::text) > 524288 then
    raise exception using errcode = '23514', message = 'Funnel flow definition is invalid';
  end if;
  if nullif(v_flow->>'entryPageId', '') is not null
     and not (v_flow->>'entryPageId' = any(v_page_ids)) then
    raise exception using errcode = '23514', message = 'Funnel flow entry page does not exist';
  end if;

  if v_flow ? 'connections' then
    if jsonb_typeof(v_flow->'connections') <> 'array'
       or jsonb_array_length(v_flow->'connections') > 1000 then
      raise exception using errcode = '23514', message = 'Funnel flow connections are invalid';
    end if;
    v_connections := v_flow->'connections';
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', 'linear:' || page_id || ':' || next_page_id,
        'sourcePageId', page_id,
        'targetPageId', next_page_id,
        'isDefault', true,
        'priority', 0
      ) order by row_num
    ), '[]'::jsonb)
    into v_connections
    from (
      select page_id, row_num, lead(page_id) over (order by row_num) as next_page_id
      from (
        select page->>'id' as page_id,
          row_number() over (
            order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
          ) as row_num
        from jsonb_array_elements(v_pages)
          with ordinality as page_rows(page, ordinal)
      ) ordered_pages
    ) linear_pages
    where next_page_id is not null;
  end if;

  v_ranges := case
    when v_flow ? 'resultRanges' then v_flow->'resultRanges'
    else '[]'::jsonb
  end;
  v_scoring_rules := case
    when v_flow ? 'scoringRules' then v_flow->'scoringRules'
    else '[]'::jsonb
  end;
  if jsonb_typeof(v_ranges) <> 'array'
     or jsonb_array_length(v_ranges) > 500
     or jsonb_typeof(v_scoring_rules) <> 'array'
     or jsonb_array_length(v_scoring_rules) > 500 then
    raise exception using errcode = '23514', message = 'Flow scoring or result ranges are invalid';
  end if;

  if (
    select count(*) <> count(distinct connection->>'id')
    from jsonb_array_elements(v_connections) connection
  ) then
    raise exception using errcode = '23514', message = 'Flow connection ids must be unique';
  end if;

  for v_connection in select value from jsonb_array_elements(v_connections)
  loop
    if jsonb_typeof(v_connection) <> 'object'
       or nullif(v_connection->>'id', '') is null
       or char_length(v_connection->>'id') > 200
       or not (v_connection->>'sourcePageId' = any(v_page_ids))
       or not (v_connection->>'targetPageId' = any(v_page_ids))
       or (v_connection ? 'isDefault' and jsonb_typeof(v_connection->'isDefault') <> 'boolean')
       or (v_connection ? 'priority' and jsonb_typeof(v_connection->'priority') <> 'number') then
      raise exception using errcode = '23514', message = 'Flow connection is invalid';
    end if;

    if coalesce(v_connection->'isDefault', 'false'::jsonb) = 'true'::jsonb then
      if jsonb_typeof(v_connection#>'{condition,conditions}') = 'array'
         and jsonb_array_length(v_connection#>'{condition,conditions}') > 0 then
        raise exception using errcode = '23514', message = 'Default flow connection cannot have a condition';
      end if;
    elsif not private.funnel_condition_group_is_valid(
      v_connection->'condition', v_field_keys, v_variable_keys
    ) then
      raise exception using errcode = '23514', message = 'Conditional flow connection has an invalid condition';
    end if;
  end loop;

  if (
    select count(*) <> count(distinct result_range->>'id')
    from jsonb_array_elements(v_ranges) result_range
  ) then
    raise exception using errcode = '23514', message = 'Flow result range ids must be unique';
  end if;

  for v_range in select value from jsonb_array_elements(v_ranges)
  loop
    if jsonb_typeof(v_range) <> 'object'
       or nullif(v_range->>'id', '') is null
       or char_length(v_range->>'id') > 160
       or nullif(trim(v_range->>'label'), '') is null
       or char_length(v_range->>'label') > 160
       or not (v_range->>'sourcePageId' = any(v_page_ids))
       or not (v_range->>'targetPageId' = any(v_page_ids))
       or (v_range ? 'minScore' and jsonb_typeof(v_range->'minScore') <> 'number')
       or (v_range ? 'maxScore' and jsonb_typeof(v_range->'maxScore') <> 'number')
       or (
         v_range ? 'minScore' and v_range ? 'maxScore'
         and (v_range->>'minScore')::numeric > (v_range->>'maxScore')::numeric
       )
       or (
         v_range ? 'resultKey'
         and (
           jsonb_typeof(v_range->'resultKey') <> 'string'
           or char_length(v_range->>'resultKey') not between 1 and 160
         )
       ) then
      raise exception using errcode = '23514', message = 'Flow result range is invalid';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_ranges) with ordinality as left_rows(left_range, left_order)
    join jsonb_array_elements(v_ranges) with ordinality as right_rows(right_range, right_order)
      on right_order > left_order
     and right_range->>'sourcePageId' = left_range->>'sourcePageId'
    where (
      not (left_range ? 'minScore')
      or not (right_range ? 'maxScore')
      or (left_range->>'minScore')::numeric <= (right_range->>'maxScore')::numeric
    )
      and (
        not (right_range ? 'minScore')
        or not (left_range ? 'maxScore')
        or (right_range->>'minScore')::numeric <= (left_range->>'maxScore')::numeric
      )
  ) then
    raise exception using errcode = '23514', message = 'Flow result ranges from the same page cannot overlap';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_ranges) result_range
    where exists (
      select 1
      from jsonb_array_elements(v_connections) connection
      where connection->>'sourcePageId' = result_range->>'sourcePageId'
        and connection->>'targetPageId' = result_range->>'targetPageId'
    )
    or exists (
      select 1
      from jsonb_array_elements(v_elements) element
      join lateral (
        select page->>'slug' as slug
        from jsonb_array_elements(v_pages) page
        where page->>'id' = result_range->>'targetPageId'
        limit 1
      ) target_page on true
      where element->>'pageId' = result_range->>'sourcePageId'
        and element->>'type' in ('button', 'cta')
        and (
          (
            element#>>'{content,action}' = 'go_to_page'
            and element#>>'{content,target}' in (
              result_range->>'targetPageId', target_page.slug
            )
          )
          or (
            nullif(element#>>'{content,action}', '') is null
            and exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(element#>'{logic,actions}') = 'array'
                    then element#>'{logic,actions}'
                  else '[]'::jsonb
                end
              ) action
              where action->>'type' = 'go_to_page'
                and action->>'trigger' = 'click'
                and action->>'target' in (
                  result_range->>'targetPageId', target_page.slug
                )
            )
          )
        )
    )
  ) then
    raise exception using errcode = '23514', message = 'A result range edge cannot share its source and target with a flow connection or direct action';
  end if;

  for v_rule in select value from jsonb_array_elements(v_scoring_rules)
  loop
    if jsonb_typeof(v_rule) <> 'object'
       or nullif(v_rule->>'id', '') is null
       or char_length(v_rule->>'id') > 160
       or jsonb_typeof(v_rule->'points') <> 'number'
       or abs((v_rule->>'points')::numeric) > 1000000000
       or not private.funnel_condition_group_is_valid(
         v_rule->'condition', v_field_keys, v_variable_keys
       ) then
      raise exception using errcode = '23514', message = 'Global scoring rule is invalid';
    end if;
  end loop;

  foreach v_page_id in array v_page_ids
  loop
    select count(*) filter (where connection->'isDefault' = 'true'::jsonb),
           count(*) filter (
             where coalesce(connection->'isDefault', 'false'::jsonb) <> 'true'::jsonb
           )
    into v_default_count, v_branch_count
    from jsonb_array_elements(v_connections) connection
    where connection->>'sourcePageId' = v_page_id;

    select count(*) into v_range_count
    from jsonb_array_elements(v_ranges) result_range
    where result_range->>'sourcePageId' = v_page_id;

    if v_default_count > 1 then
      raise exception using errcode = '23514', message = 'A flow page cannot have multiple default destinations';
    end if;
    if v_branch_count + v_range_count > 0 and v_default_count <> 1 then
      raise exception using errcode = '23514', message = 'Every branching page requires exactly one default destination';
    end if;
  end loop;

  if exists (
    with recursive
    page_rows as (
      select page->>'id' as id, page->>'slug' as slug
      from jsonb_array_elements(v_pages) page
    ),
    action_targets as (
      select element->>'pageId' as source_id, raw_target.target
      from jsonb_array_elements(v_elements) element
      cross join lateral (
        select element#>>'{content,target}' as target
        where element->>'type' in ('button', 'cta')
          and element#>>'{content,action}' = 'go_to_page'
        union all
        select action->>'target'
        from jsonb_array_elements(
          case
            when jsonb_typeof(element#>'{logic,actions}') = 'array'
              then element#>'{logic,actions}'
            else '[]'::jsonb
          end
        ) action
        where element->>'type' in ('button', 'cta')
          and case
            when jsonb_typeof(element#>'{logic,actions}') = 'array'
              then jsonb_array_length(element#>'{logic,actions}') = 1
            else false
          end
          and nullif(element#>>'{content,action}', '') is null
          and action->>'type' = 'go_to_page'
          and action->>'trigger' = 'click'
      ) raw_target
    ),
    edges as (
      select connection->>'sourcePageId' as source_id,
             connection->>'targetPageId' as target_id
      from jsonb_array_elements(v_connections) connection
      union
      select result_range->>'sourcePageId', result_range->>'targetPageId'
      from jsonb_array_elements(v_ranges) result_range
      union
      select action_target.source_id, target_page.id
      from action_targets action_target
      join page_rows target_page
        on target_page.id = action_target.target
        or target_page.slug = action_target.target
    ),
    entry_page as (
      select coalesce(
        nullif(v_flow->>'entryPageId', ''),
        (
          select page->>'id'
          from jsonb_array_elements(v_pages)
            with ordinality as ordered_pages(page, ordinal)
          order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
          limit 1
        )
      ) as id
    ),
    reachable(id) as (
      select id from entry_page
      union
      select edge.target_id
      from edges edge
      join reachable reached on reached.id = edge.source_id
    )
    select 1
    from page_rows page
    where not exists (select 1 from reachable where reachable.id = page.id)
  ) then
    raise exception using errcode = '23514', message = 'Published funnel contains an unreachable page';
  end if;

  if exists (
    with recursive
    page_rows as (
      select page->>'id' as id, page->>'slug' as slug
      from jsonb_array_elements(v_pages) page
    ),
    action_targets as (
      select element->>'pageId' as source_id, raw_target.target
      from jsonb_array_elements(v_elements) element
      cross join lateral (
        select element#>>'{content,target}' as target
        where element->>'type' in ('button', 'cta')
          and element#>>'{content,action}' = 'go_to_page'
        union all
        select action->>'target'
        from jsonb_array_elements(
          case
            when jsonb_typeof(element#>'{logic,actions}') = 'array'
              then element#>'{logic,actions}'
            else '[]'::jsonb
          end
        ) action
        where element->>'type' in ('button', 'cta')
          and case
            when jsonb_typeof(element#>'{logic,actions}') = 'array'
              then jsonb_array_length(element#>'{logic,actions}') = 1
            else false
          end
          and nullif(element#>>'{content,action}', '') is null
          and action->>'type' = 'go_to_page'
          and action->>'trigger' = 'click'
      ) raw_target
    ),
    edges as (
      select connection->>'sourcePageId' as source_id,
             connection->>'targetPageId' as target_id
      from jsonb_array_elements(v_connections) connection
      union
      select result_range->>'sourcePageId', result_range->>'targetPageId'
      from jsonb_array_elements(v_ranges) result_range
      union
      select action_target.source_id, target_page.id
      from action_targets action_target
      join page_rows target_page
        on target_page.id = action_target.target
        or target_page.slug = action_target.target
    ),
    entry_page as (
      select coalesce(
        nullif(v_flow->>'entryPageId', ''),
        (
          select page->>'id'
          from jsonb_array_elements(v_pages)
            with ordinality as ordered_pages(page, ordinal)
          order by coalesce((page->>'order')::integer, ordinal::integer - 1), ordinal
          limit 1
        )
      ) as id
    ),
    reachable(id) as (
      select id from entry_page
      union
      select edge.target_id
      from edges edge
      join reachable reached on reached.id = edge.source_id
    ),
    completion_controls as (
      select distinct
        element->>'pageId' as page_id,
        resolved_action.action_type
      from jsonb_array_elements(v_elements) element
      cross join lateral (
        select coalesce(
          nullif(element#>>'{content,action}', ''),
          nullif(element#>>'{logic,actions,0,type}', ''),
          'next_page'
        ) as action_type
      ) resolved_action
      where element->>'type' in ('button', 'cta')
        and resolved_action.action_type in ('submit', 'next_page')
        and private.funnel_snapshot_element_is_unconditionally_visible(
          p_snapshot, element->>'id'
        )
    ),
    terminal_pages as (
      select page.id
      from page_rows page
      where exists (
        select 1
        from completion_controls control
        where control.page_id = page.id
          and control.action_type = 'submit'
      )
         or (
           not exists (select 1 from edges where edges.source_id = page.id)
           and exists (
             select 1
             from completion_controls control
             where control.page_id = page.id
               and control.action_type = 'next_page'
           )
         )
    ),
    can_exit(id) as (
      select id from terminal_pages
      union
      select edge.source_id
      from edges edge
      join can_exit exiting on exiting.id = edge.target_id
    )
    select 1
    from reachable
    where not exists (select 1 from can_exit where can_exit.id = reachable.id)
  ) then
    raise exception using errcode = '23514', message = 'Published funnel contains a cycle or terminal path without an actionable completion control';
  end if;
end;
$$;

create or replace function private.validate_published_funnel_version()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.kind = 'published' then
    perform private.assert_funnel_snapshot_publishable(new.snapshot);
  end if;
  return new;
end;
$$;

drop trigger if exists funnel_versions_validate_publication
  on public.funnel_versions;
create trigger funnel_versions_validate_publication
  before insert or update of kind, snapshot
  on public.funnel_versions
  for each row execute function private.validate_published_funnel_version();

do $funnel_existing_publication_validation$
declare
  v_snapshot jsonb;
begin
  for v_snapshot in
    select version_row.snapshot
    from public.funnel_versions version_row
    where version_row.kind = 'published'
  loop
    perform private.assert_funnel_snapshot_publishable(v_snapshot);
  end loop;
end;
$funnel_existing_publication_validation$;

revoke execute on function private.is_safe_funnel_script_url(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_visibility_group_is_valid(jsonb, text[], text[])
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_visibility_group_matches(jsonb, jsonb, jsonb, jsonb, numeric, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_snapshot_element_is_visible(jsonb, text, jsonb, jsonb, numeric)
  from public, anon, authenticated, service_role;
revoke execute on function private.prune_funnel_snapshot_values(jsonb, jsonb, text[], jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.funnel_answer_value_is_valid(text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.assert_funnel_snapshot_answers_valid(jsonb, jsonb, text[], jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.assert_funnel_snapshot_publishable(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_published_funnel_version()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Narrow public runtime RPC implementations
-- ---------------------------------------------------------------------------

-- The renderer passes the exact immutable publication/version pair it loaded.
-- Binding session creation to that pair closes the gap where a republish could
-- happen between SSR rendering and the browser's start-session request.
create or replace function private.start_funnel_session_impl(
  p_slug text,
  p_publication_id uuid,
  p_version_id uuid,
  p_session_key uuid default null,
  p_utm jsonb default '{}'::jsonb,
  p_device jsonb default '{}'::jsonb
)
returns table (
  session_key uuid,
  funnel_id uuid,
  publication_id uuid,
  version_id uuid,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_publication public.funnel_publications%rowtype;
  v_session public.funnel_sessions%rowtype;
  v_key uuid := coalesce(p_session_key, gen_random_uuid());
begin
  if nullif(trim(p_slug), '') is null
     or char_length(p_slug) > 120
     or p_publication_id is null
     or p_version_id is null then
    raise exception using errcode = '22023', message = 'Invalid published funnel identity';
  end if;

  if jsonb_typeof(coalesce(p_utm, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_device, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_utm, '{}'::jsonb)::text) > 16000
     or octet_length(coalesce(p_device, '{}'::jsonb)::text) > 16000
     or exists (
       select 1
       from jsonb_object_keys(coalesce(p_utm, '{}'::jsonb)) utm_key
       where utm_key not in (
         'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
       )
     )
     or exists (
       select 1
       from jsonb_each(coalesce(p_utm, '{}'::jsonb)) utm_entry
       where jsonb_typeof(utm_entry.value) <> 'string'
         or char_length(utm_entry.value #>> '{}') > 500
     ) then
    raise exception using errcode = '22023', message = 'Invalid session metadata';
  end if;

  select publication_row.* into v_publication
  from public.funnel_publications publication_row
  join public.funnels funnel_row
    on funnel_row.id = publication_row.funnel_id
  join public.funnel_versions version_row
    on version_row.id = publication_row.version_id
   and version_row.funnel_id = publication_row.funnel_id
  where publication_row.id = p_publication_id
    and publication_row.version_id = p_version_id
    and lower(publication_row.slug) = lower(trim(p_slug))
    and publication_row.is_active
    and funnel_row.status = 'published'
    and funnel_row.published_version_id = publication_row.version_id
    and version_row.kind = 'published'
  limit 1;

  if not found then
    raise exception using errcode = '55000', message = 'Rendered publication is no longer active; reload the funnel';
  end if;

  select session_row.* into v_session
  from public.funnel_sessions session_row
  where session_row.session_key = v_key
  for update;

  if found then
    if v_session.funnel_id <> v_publication.funnel_id
       or v_session.publication_id <> v_publication.id
       or v_session.version_id <> v_publication.version_id then
      raise exception using errcode = '22023', message = 'Session key belongs to another published funnel version';
    end if;
    if v_session.status <> 'active' or v_session.expires_at <= now() then
      raise exception using errcode = '55000', message = 'Funnel session is not active';
    end if;

    update public.funnel_sessions session_row
    set last_seen_at = now()
    where session_row.id = v_session.id
    returning session_row.* into v_session;
  else
    insert into public.funnel_sessions (
      session_key, funnel_id, publication_id, version_id, utm, device
    ) values (
      v_key,
      v_publication.funnel_id,
      v_publication.id,
      v_publication.version_id,
      coalesce(p_utm, '{}'::jsonb),
      coalesce(p_device, '{}'::jsonb)
    ) returning * into v_session;

    insert into public.funnel_events (
      funnel_id, session_id, event_key, event_type, payload
    ) values (
      v_session.funnel_id,
      v_session.id,
      'session:start',
      'session_started',
      '{}'::jsonb
    ) on conflict (session_id, event_key) do nothing;
  end if;

  return query select
    v_session.session_key,
    v_session.funnel_id,
    v_session.publication_id,
    v_session.version_id,
    v_session.expires_at;
end;
$$;

create or replace function private.track_funnel_event_impl(
  p_session_key uuid,
  p_event_key text,
  p_event_type text,
  p_page_id uuid default null,
  p_element_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.funnel_sessions%rowtype;
  v_snapshot jsonb;
  v_element jsonb;
  v_inserted boolean;
  v_expected_prefix text;
begin
  if p_session_key is null
     or p_event_type not in (
       'view', 'start', 'page_view', 'interaction', 'complete',
       'validation_error'
     )
     or p_event_type <> lower(trim(p_event_type))
     or nullif(trim(p_event_key), '') is null
     or char_length(p_event_key) > 160 then
    raise exception using errcode = '22023', message = 'Invalid funnel event';
  end if;

  v_expected_prefix := p_session_key::text || ':' || p_event_type || ':';
  if strpos(trim(p_event_key), v_expected_prefix) <> 1
     or trim(p_event_key) ~ '(^|:)(?:session|submission|webhook|internal):' then
    raise exception using errcode = '22023', message = 'Reserved or mismatched funnel event key';
  end if;

  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 8192 then
    raise exception using errcode = '22023', message = 'Invalid event payload';
  end if;

  select * into v_session
  from public.funnel_sessions session_row
  where session_row.session_key = p_session_key
  for update;

  if not found or v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '55000', message = 'Funnel session is not active';
  end if;

  select version_row.snapshot into v_snapshot
  from public.funnel_versions version_row
  where version_row.id = v_session.version_id
    and version_row.funnel_id = v_session.funnel_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pinned funnel version not found';
  end if;

  if p_page_id is not null and not exists (
    select 1
    from jsonb_array_elements(coalesce(v_snapshot->'pages', '[]'::jsonb)) page
    where page->>'id' = p_page_id::text
  ) then
    raise exception using errcode = '22023', message = 'Event page is not part of the published snapshot';
  end if;

  if p_element_id is not null then
    select element into v_element
    from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb)) element
    where element->>'id' = p_element_id::text
    limit 1;
    if not found
       or (
         p_page_id is not null
         and v_element->>'pageId' <> p_page_id::text
       ) then
      raise exception using errcode = '22023', message = 'Event element is not part of the selected snapshot page';
    end if;
  end if;

  with inserted as (
    insert into public.funnel_events (
      funnel_id, session_id, event_key, event_type, page_id, element_id, payload
    ) values (
      v_session.funnel_id,
      v_session.id,
      trim(p_event_key),
      p_event_type,
      p_page_id,
      p_element_id,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (session_id, event_key) do nothing
    returning 1
  )
  select exists(select 1 from inserted) into v_inserted;

  update public.funnel_sessions
  set last_seen_at = now(),
      current_page_id = coalesce(p_page_id, current_page_id),
      first_interaction_at = case
        when p_event_type = 'start' then coalesce(first_interaction_at, now())
        else first_interaction_at
      end
  where id = v_session.id;

  return v_inserted;
end;
$$;

drop function if exists public.save_funnel_progress(uuid, uuid, jsonb, jsonb);
drop function if exists private.save_funnel_progress_impl(uuid, uuid, jsonb, jsonb);

create function private.save_funnel_progress_impl(
  p_session_key uuid,
  p_page_id uuid,
  p_page_path uuid[],
  p_values jsonb default '{}'::jsonb,
  p_lead jsonb default '{}'::jsonb
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.funnel_sessions%rowtype;
  v_snapshot jsonb;
  v_input_values jsonb;
  v_values jsonb;
  v_lead jsonb;
  v_authoritative_utm jsonb := '{}'::jsonb;
  v_active_page_ids text[];
  v_saved_at timestamptz := now();
  v_name_field_key text;
  v_email_field_key text;
  v_phone_field_key text;
  v_derived_name text;
  v_derived_email text;
  v_derived_phone text;
begin
  if p_session_key is null
     or p_page_id is null
     or p_page_path is null
     or jsonb_typeof(coalesce(p_values, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_lead, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_values, '{}'::jsonb)::text) > 262144
     or octet_length(coalesce(p_lead, '{}'::jsonb)::text) > 32768 then
    raise exception using errcode = '22023', message = 'Invalid funnel progress payload';
  end if;

  select * into v_session
  from public.funnel_sessions session_row
  where session_row.session_key = p_session_key
  for update;

  if not found or v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '55000', message = 'Funnel session is not active';
  end if;

  select version_row.snapshot into v_snapshot
  from public.funnel_versions version_row
  where version_row.id = v_session.version_id
    and version_row.funnel_id = v_session.funnel_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pinned funnel version not found';
  end if;

  if p_page_id is not null and not exists (
    select 1
    from jsonb_array_elements(coalesce(v_snapshot->'pages', '[]'::jsonb)) page
    where page->>'id' = p_page_id::text
  ) then
    raise exception using errcode = '22023', message = 'Progress page is not part of the published snapshot';
  end if;

  -- Browser-provided system values are never accepted as authoritative.
  v_input_values := coalesce(p_values, '{}'::jsonb)
    - 'system.score'
    - 'system.result';
  -- The browser sends the complete active answer snapshot. Replacement is
  -- intentional: merging would resurrect answers autosaved on an abandoned
  -- branch and later let them affect required checks, scoring and analytics.
  v_values := v_input_values;

  if not private.funnel_values_match_snapshot(v_snapshot, v_values) then
    raise exception using errcode = '22023', message = 'Funnel values exceed limits or contain an unknown field';
  end if;

  v_active_page_ids := private.validate_funnel_snapshot_page_path(
    v_snapshot,
    v_values,
    v_session.utm,
    array(
      select path_page_id::text
      from unnest(p_page_path) with ordinality as path_rows(path_page_id, ordinal)
      order by ordinal
    )
  );
  if v_active_page_ids[cardinality(v_active_page_ids)] <> p_page_id::text then
    raise exception using errcode = '23514', message = 'Progress page must be the final page in the active path';
  end if;
  v_values := private.prune_funnel_snapshot_values(
    v_snapshot, v_values, v_active_page_ids, v_session.utm
  );

  if not private.funnel_values_match_snapshot(v_snapshot, v_values) then
    raise exception using errcode = '22023', message = 'Merged funnel values exceed limits or contain an unknown field';
  end if;

  -- Lead identity is derived from the validated/pruned answers. p_lead remains
  -- in the public contract for compatibility but cannot inject independent
  -- identity or campaign data into an anonymous session.
  select element->'content'->>'fieldKey' into v_name_field_key
  from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'short_text'
  order by ordinal
  limit 1;
  select element->'content'->>'fieldKey' into v_email_field_key
  from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'email'
  order by ordinal
  limit 1;
  select element->'content'->>'fieldKey' into v_phone_field_key
  from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'phone'
  order by ordinal
  limit 1;

  v_derived_name := nullif(trim(coalesce(
    v_values->>'lead.first_name',
    v_values->>'nome',
    v_values->>'name',
    v_values->>v_name_field_key,
    ''
  )), '');
  v_derived_email := lower(nullif(trim(coalesce(
    v_values->>'lead.email',
    v_values->>'email',
    v_values->>v_email_field_key,
    ''
  )), ''));
  if v_derived_email is not null
     and v_derived_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_derived_email := null;
  end if;
  v_derived_phone := nullif(regexp_replace(coalesce(
    v_values->>'lead.phone',
    v_values->>'telefone',
    v_values->>'phone',
    v_values->>v_phone_field_key,
    ''
  ), '[^0-9]', '', 'g'), '');

  select coalesce(jsonb_object_agg(utm_entry.key, utm_entry.value), '{}'::jsonb)
  into v_authoritative_utm
  from jsonb_each(coalesce(v_session.utm, '{}'::jsonb)) utm_entry
  where utm_entry.key in (
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
  );
  v_lead := jsonb_strip_nulls(jsonb_build_object(
    'name', case when v_derived_name is null then null else left(v_derived_name, 240) end,
    'email', case when v_derived_email is null then null else left(v_derived_email, 320) end,
    'phone', case when v_derived_phone is null then null else left(v_derived_phone, 64) end
  )) || v_authoritative_utm;

  if not private.funnel_jsonb_object_within_limits(v_lead, 32768, 64, 128)
     or exists (
       select 1
       from jsonb_object_keys(v_lead) lead_key
       where lead_key not in (
         'name', 'first_name', 'email', 'phone',
         'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
       )
     ) then
    raise exception using errcode = '22023', message = 'Merged funnel lead exceeds limits or contains an unknown field';
  end if;

  -- This idempotent server-side start marker closes the race where the browser
  -- sends analytics asynchronously and progress or completion wins first.
  insert into public.funnel_events (
    funnel_id, session_id, event_key, event_type, page_id, payload
  ) values (
    v_session.funnel_id,
    v_session.id,
    v_session.session_key::text || ':start:funnel:first-interaction',
    'start',
    p_page_id,
    jsonb_build_object('source', 'progress')
  ) on conflict (session_id, event_key) do nothing;

  update public.funnel_sessions
  set current_page_id = coalesce(p_page_id, current_page_id),
      values = v_values,
      lead = v_lead,
      first_interaction_at = coalesce(first_interaction_at, v_saved_at),
      last_seen_at = v_saved_at
  where id = v_session.id;

  return v_saved_at;
end;
$$;

revoke execute on function private.track_funnel_event_impl(uuid, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.save_funnel_progress_impl(uuid, uuid, uuid[], jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.track_funnel_event_impl(uuid, text, text, uuid, uuid, jsonb)
  to anon, authenticated;
grant execute on function private.save_funnel_progress_impl(uuid, uuid, uuid[], jsonb, jsonb)
  to anon, authenticated;

drop function if exists public.submit_funnel(uuid, jsonb, jsonb);
drop function if exists private.submit_funnel_impl(uuid, jsonb, jsonb);

create function private.submit_funnel_impl(
  p_session_key uuid,
  p_page_id uuid,
  p_page_path uuid[],
  p_values jsonb default '{}'::jsonb,
  p_lead jsonb default '{}'::jsonb
)
returns table (submission_id uuid, completed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.funnel_sessions%rowtype;
  v_existing public.funnel_submissions%rowtype;
  v_snapshot jsonb;
  v_submission_id uuid := gen_random_uuid();
  v_completed_at timestamptz := now();
  v_input_values jsonb;
  v_values jsonb;
  v_lead jsonb;
  v_authoritative_utm jsonb := '{}'::jsonb;
  v_active_page_ids text[] := array[]::text[];
  v_score numeric := 0;
  v_result_key text;
  v_name_field_key text;
  v_email_field_key text;
  v_phone_field_key text;
  v_derived_name text;
  v_derived_email text;
  v_derived_phone text;
begin
  if p_session_key is null
     or p_page_id is null
     or p_page_path is null
     or jsonb_typeof(coalesce(p_values, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_lead, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_values, '{}'::jsonb)::text) > 262144
     or octet_length(coalesce(p_lead, '{}'::jsonb)::text) > 32768 then
    raise exception using errcode = '22023', message = 'Invalid submission payload';
  end if;

  select * into v_session
  from public.funnel_sessions session_row
  where session_row.session_key = p_session_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Funnel session not found';
  end if;

  select * into v_existing
  from public.funnel_submissions submission_row
  where submission_row.session_id = v_session.id;
  if found then
    return query select v_existing.id, v_existing.submitted_at;
    return;
  end if;

  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '55000', message = 'Funnel session is not active';
  end if;

  select version_row.snapshot into v_snapshot
  from public.funnel_versions version_row
  where version_row.id = v_session.version_id
    and version_row.funnel_id = v_session.funnel_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pinned funnel version not found';
  end if;

  v_input_values := coalesce(p_values, '{}'::jsonb)
    - 'system.score'
    - 'system.result';
  -- Submission is authoritative for the active browser path. Never merge the
  -- prior autosave because it may contain values from a branch since pruned.
  v_values := v_input_values;

  if not private.funnel_values_match_snapshot(v_snapshot, v_values) then
    raise exception using errcode = '22023', message = 'Merged submission values exceed limits or contain an unknown field';
  end if;

  v_active_page_ids := private.validate_funnel_snapshot_page_path(
    v_snapshot,
    v_values,
    v_session.utm,
    array(
      select path_page_id::text
      from unnest(p_page_path) with ordinality as path_rows(path_page_id, ordinal)
      order by ordinal
    )
  );
  if v_active_page_ids[cardinality(v_active_page_ids)] <> p_page_id::text then
    raise exception using errcode = '23514', message = 'Submission page must be the final page in the active path';
  end if;
  v_values := private.prune_funnel_snapshot_values(
    v_snapshot, v_values, v_active_page_ids, v_session.utm
  );

  if not private.funnel_snapshot_page_can_submit(
    v_snapshot,
    p_page_id::text,
    v_active_page_ids,
    v_values,
    v_session.utm
  ) then
    raise exception using errcode = '23514', message = 'The final funnel page is not eligible for submission';
  end if;

  perform private.assert_funnel_snapshot_answers_valid(
    v_snapshot,
    v_values,
    v_active_page_ids,
    v_session.utm,
    v_session.funnel_id,
    v_session.session_key
  );

  v_result_key := private.resolve_funnel_snapshot_result_for_path(
    v_snapshot, v_values, v_session.utm, v_active_page_ids
  );
  v_score := private.calculate_funnel_snapshot_score(
    v_snapshot,
    v_values || jsonb_build_object('system.result', v_result_key),
    v_session.utm
  );

  v_values := jsonb_set(
    v_values,
    '{system.score}',
    to_jsonb(v_score),
    true
  );
  if v_result_key is null then
    v_values := v_values - 'system.result';
  else
    v_values := jsonb_set(
      v_values,
      '{system.result}',
      to_jsonb(left(v_result_key, 160)),
      true
    );
  end if;

  select coalesce(jsonb_object_agg(utm_entry.key, utm_entry.value), '{}'::jsonb)
  into v_authoritative_utm
  from jsonb_each(coalesce(v_session.utm, '{}'::jsonb)) utm_entry
  where utm_entry.key in (
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
  );

  select element->'content'->>'fieldKey' into v_name_field_key
  from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'short_text'
  order by ordinal
  limit 1;
  select element->'content'->>'fieldKey' into v_email_field_key
  from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'email'
  order by ordinal
  limit 1;
  select element->'content'->>'fieldKey' into v_phone_field_key
  from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb))
    with ordinality as element_rows(element, ordinal)
  where element->>'type' = 'phone'
  order by ordinal
  limit 1;

  v_derived_name := nullif(trim(coalesce(
    v_values->>'lead.first_name',
    v_values->>'nome',
    v_values->>'name',
    v_values->>v_name_field_key,
    ''
  )), '');
  v_derived_email := lower(nullif(trim(coalesce(
    v_values->>'lead.email',
    v_values->>'email',
    v_values->>v_email_field_key,
    ''
  )), ''));
  if v_derived_email is not null
     and v_derived_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_derived_email := null;
  end if;
  v_derived_phone := nullif(regexp_replace(coalesce(
    v_values->>'lead.phone',
    v_values->>'telefone',
    v_values->>'phone',
    v_values->>v_phone_field_key,
    ''
  ), '[^0-9]', '', 'g'), '');

  v_lead := jsonb_strip_nulls(jsonb_build_object(
    'name', case when v_derived_name is null then null else left(v_derived_name, 240) end,
    'email', case when v_derived_email is null then null else left(v_derived_email, 320) end,
    'phone', case when v_derived_phone is null then null else left(v_derived_phone, 64) end
  )) || v_authoritative_utm || jsonb_build_object(
    'score', v_score,
    'resultKey', case when v_result_key is null then null else left(v_result_key, 160) end
  );

  if not private.funnel_values_match_snapshot(v_snapshot, v_values)
     or not private.funnel_jsonb_object_within_limits(v_lead, 32768, 64, 128)
     or exists (
       select 1
       from jsonb_object_keys(v_lead) lead_key
       where lead_key not in (
         'name', 'first_name', 'email', 'phone', 'score', 'resultKey',
         'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
       )
     ) then
    raise exception using errcode = '22023', message = 'Final submission payload exceeds its limits';
  end if;

  -- A direct submit can complete before the fire-and-forget browser analytics
  -- request. Persist the same deduplication key atomically with completion.
  insert into public.funnel_events (
    funnel_id, session_id, event_key, event_type, page_id, payload
  ) values (
    v_session.funnel_id,
    v_session.id,
    v_session.session_key::text || ':start:funnel:first-interaction',
    'start',
    p_page_id,
    jsonb_build_object('source', 'submission')
  ) on conflict (session_id, event_key) do nothing;

  insert into public.funnel_submissions (
    id, funnel_id, session_id, version_id, name, email, phone,
    lead, score, result_key, submitted_at
  ) values (
    v_submission_id,
    v_session.funnel_id,
    v_session.id,
    v_session.version_id,
    nullif(left(trim(coalesce(v_lead->>'name', v_lead->>'first_name', '')), 240), ''),
    nullif(left(trim(coalesce(v_lead->>'email', '')), 320), ''),
    nullif(left(trim(coalesce(v_lead->>'phone', '')), 64), ''),
    v_lead,
    v_score,
    nullif(left(trim(coalesce(v_result_key, '')), 160), ''),
    v_completed_at
  );

  insert into public.funnel_submission_values (
    funnel_id, submission_id, element_id, field_key, value
  )
  select
    v_session.funnel_id,
    v_submission_id,
    (
      select nullif(element->>'id', '')::uuid
      from jsonb_array_elements(coalesce(v_snapshot->'elements', '[]'::jsonb)) element
      where element->'content'->>'fieldKey' = value_entry.key
      limit 1
    ),
    value_entry.key,
    value_entry.value
  from jsonb_each(v_values) value_entry;

  update public.funnel_sessions
  set status = 'completed',
      current_page_id = p_page_id,
      values = v_values,
      lead = v_lead,
      first_interaction_at = coalesce(first_interaction_at, v_completed_at),
      completed_at = v_completed_at,
      last_seen_at = v_completed_at
  where id = v_session.id;

  insert into public.funnel_events (
    funnel_id, session_id, event_key, event_type, page_id, payload
  ) values (
    v_session.funnel_id,
    v_session.id,
    'submission:completed',
    'funnel_completed',
    p_page_id,
    jsonb_build_object(
      'submissionId', v_submission_id,
      'score', v_score,
      'resultKey', v_result_key
    )
  ) on conflict (session_id, event_key) do nothing;

  return query select v_submission_id, v_completed_at;
end;
$$;

revoke execute on function private.submit_funnel_impl(uuid, uuid, uuid[], jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.submit_funnel_impl(uuid, uuid, uuid[], jsonb, jsonb)
  to anon, authenticated, service_role;
grant execute on function private.track_funnel_event_impl(uuid, text, text, uuid, uuid, jsonb)
  to service_role;
grant execute on function private.save_funnel_progress_impl(uuid, uuid, uuid[], jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Deterministic destructive cleanup and atomic save + publish
-- ---------------------------------------------------------------------------

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
  select * into v_funnel
  from public.funnels funnel_row
  where funnel_row.id = p_funnel_id
  for update;

  if not found or not private.is_funnel_admin(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Workspace owner or admin permission required';
  end if;
  if nullif(trim(p_confirmation_name), '') is null
     or trim(p_confirmation_name) <> v_funnel.name then
    raise exception using errcode = '22023', message = 'Funnel name confirmation does not match';
  end if;

  -- Keep reusable templates, but detach their source pointers before deleting
  -- immutable versions. Runtime rows are removed before their RESTRICT targets.
  update public.funnel_templates
  set source_funnel_id = null,
      source_version_id = null,
      updated_at = now()
  where source_funnel_id = p_funnel_id
     or source_version_id in (
       select version_row.id
       from public.funnel_versions version_row
       where version_row.funnel_id = p_funnel_id
     );

  delete from public.funnel_webhook_deliveries
  where funnel_webhook_deliveries.funnel_id = p_funnel_id;
  delete from public.funnel_submission_values
  where funnel_submission_values.funnel_id = p_funnel_id;
  delete from public.funnel_events
  where funnel_events.funnel_id = p_funnel_id;
  delete from public.funnel_submissions
  where funnel_submissions.funnel_id = p_funnel_id;
  delete from public.funnel_sessions
  where funnel_sessions.funnel_id = p_funnel_id;
  delete from public.funnel_publications
  where funnel_publications.funnel_id = p_funnel_id;
  delete from public.funnel_integrations
  where funnel_integrations.funnel_id = p_funnel_id;

  delete from public.funnel_elements
  where funnel_elements.funnel_id = p_funnel_id;
  delete from public.funnel_pages
  where funnel_pages.funnel_id = p_funnel_id;
  delete from public.funnel_variables
  where funnel_variables.funnel_id = p_funnel_id;

  update public.funnels
  set latest_draft_version_id = null,
      published_version_id = null,
      published_revision = null
  where id = p_funnel_id;

  delete from public.funnel_versions
  where funnel_versions.funnel_id = p_funnel_id;
  delete from public.funnels
  where id = p_funnel_id;

  return query select p_funnel_id, v_funnel.name;
end;
$$;

create or replace function private.get_funnel_integration_impl(p_funnel_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_integration public.funnel_integrations%rowtype;
begin
  if not private.is_funnel_admin(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Workspace owner or admin permission required';
  end if;

  select * into v_integration
  from public.funnel_integrations integration_row
  where integration_row.funnel_id = p_funnel_id;

  if not found then
    return jsonb_build_object(
      'webhookEnabled', false,
      'webhookUrl', null,
      'hasWebhookSecret', false,
      'secretPreview', null
    );
  end if;

  return jsonb_build_object(
    'webhookEnabled', v_integration.webhook_enabled,
    'webhookUrl', v_integration.webhook_url,
    'hasWebhookSecret', v_integration.webhook_secret is not null,
    'secretPreview', case
      when v_integration.webhook_secret is null then null
      else repeat('*', greatest(char_length(v_integration.webhook_secret) - 4, 8))
        || right(v_integration.webhook_secret, 4)
    end,
    'updatedAt', v_integration.updated_at
  );
end;
$$;

-- Remove the slug-only session starter: callers must prove which immutable
-- publication/version was rendered and the database rechecks it atomically.
drop function if exists public.start_funnel_session(text, uuid, jsonb, jsonb);

create function public.start_funnel_session(
  p_slug text,
  p_publication_id uuid,
  p_version_id uuid,
  p_session_key uuid default null,
  p_utm jsonb default '{}'::jsonb,
  p_device jsonb default '{}'::jsonb
)
returns table (
  session_key uuid,
  funnel_id uuid,
  publication_id uuid,
  version_id uuid,
  expires_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.start_funnel_session_impl(
    p_slug,
    p_publication_id,
    p_version_id,
    p_session_key,
    p_utm,
    p_device
  );
$$;

create function public.save_funnel_progress(
  p_session_key uuid,
  p_page_id uuid,
  p_page_path uuid[],
  p_values jsonb default '{}'::jsonb,
  p_lead jsonb default '{}'::jsonb
)
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.save_funnel_progress_impl(
    p_session_key,
    p_page_id,
    p_page_path,
    p_values,
    p_lead
  );
$$;

create function public.submit_funnel(
  p_session_key uuid,
  p_page_id uuid,
  p_page_path uuid[],
  p_values jsonb default '{}'::jsonb,
  p_lead jsonb default '{}'::jsonb
)
returns table (submission_id uuid, completed_at timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.submit_funnel_impl(
    p_session_key,
    p_page_id,
    p_page_path,
    p_values,
    p_lead
  );
$$;

create or replace function public.save_and_publish_funnel(
  p_funnel_id uuid,
  p_expected_revision bigint,
  p_document jsonb,
  p_slug text default null
)
returns table (
  funnel_id uuid,
  revision bigint,
  version_id uuid,
  publication_id uuid,
  slug text,
  published_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_saved record;
begin
  if not private.is_funnel_admin(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Workspace owner or admin permission required';
  end if;

  select * into v_saved
  from private.save_funnel_draft_impl(
    p_funnel_id,
    p_expected_revision,
    p_document,
    'Salvamento para publicacao'
  );

  return query
  select *
  from private.publish_funnel_impl(
    p_funnel_id,
    v_saved.revision,
    p_slug
  );
end;
$$;

revoke execute on function private.delete_funnel_impl(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.get_funnel_integration_impl(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.start_funnel_session_impl(text, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.start_funnel_session_impl(text, uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.delete_funnel_impl(uuid, text)
  to authenticated, service_role;
grant execute on function private.get_funnel_integration_impl(uuid)
  to authenticated, service_role;
grant execute on function private.start_funnel_session_impl(text, uuid, uuid, uuid, jsonb, jsonb)
  to anon, authenticated, service_role;
grant execute on function private.save_funnel_draft_impl(uuid, bigint, jsonb, text)
  to service_role;
grant execute on function private.publish_funnel_impl(uuid, bigint, text)
  to service_role;

revoke execute on function public.start_funnel_session(text, uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.start_funnel_session(text, uuid, uuid, uuid, jsonb, jsonb)
  to anon, authenticated, service_role;

revoke execute on function public.save_funnel_progress(uuid, uuid, uuid[], jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_funnel_progress(uuid, uuid, uuid[], jsonb, jsonb)
  to anon, authenticated, service_role;

revoke execute on function public.submit_funnel(uuid, uuid, uuid[], jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_funnel(uuid, uuid, uuid[], jsonb, jsonb)
  to anon, authenticated, service_role;

revoke execute on function public.save_and_publish_funnel(uuid, bigint, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_and_publish_funnel(uuid, bigint, jsonb, text)
  to authenticated, service_role;
