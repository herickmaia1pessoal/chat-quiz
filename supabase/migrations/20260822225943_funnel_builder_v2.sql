-- Funnel Builder V2
--
-- This migration creates a new bounded context. No legacy quiz table is
-- changed. Writes go through transactional RPCs; authenticated clients receive
-- read-only table grants and RLS scopes every row to a workspace membership.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Core authoring model
-- ---------------------------------------------------------------------------

create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  slug text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  draft_revision bigint not null default 0 check (draft_revision >= 0),
  published_revision bigint check (published_revision is null or published_revision >= 0),
  latest_draft_version_id uuid,
  published_version_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint funnels_name_length check (char_length(name) between 1 and 160),
  constraint funnels_description_length check (description is null or char_length(description) <= 2000),
  constraint funnels_slug_format check (
    char_length(slug) between 1 and 120
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

create unique index funnels_slug_unique_idx on public.funnels (lower(slug));
create index funnels_workspace_status_updated_idx
  on public.funnels (workspace_id, status, updated_at desc);
create index funnels_created_by_idx on public.funnels (created_by);

create table public.funnel_pages (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  name text not null,
  slug text not null,
  order_num integer not null default 0 check (order_num >= 0),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_pages_name_length check (char_length(name) between 1 and 160),
  constraint funnel_pages_slug_format check (
    char_length(slug) between 1 and 120
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  unique (id, funnel_id),
  constraint funnel_pages_funnel_slug_unique
    unique (funnel_id, slug) deferrable initially deferred
);

create index funnel_pages_funnel_order_idx
  on public.funnel_pages (funnel_id, order_num, id);

create table public.funnel_elements (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  page_id uuid not null,
  parent_id uuid,
  slot text not null default 'default',
  order_num integer not null default 0 check (order_num >= 0),
  type text not null,
  content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object'),
  styles jsonb not null default jsonb_build_object('desktop', '{}'::jsonb)
    check (jsonb_typeof(styles) = 'object'),
  logic jsonb not null default '{}'::jsonb
    check (jsonb_typeof(logic) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_elements_type_length check (char_length(type) between 1 and 64),
  constraint funnel_elements_slot_length check (char_length(slot) between 1 and 64),
  constraint funnel_elements_not_own_parent check (parent_id is null or parent_id <> id),
  unique (id, page_id),
  foreign key (page_id, funnel_id)
    references public.funnel_pages(id, funnel_id) on delete cascade,
  foreign key (parent_id, page_id)
    references public.funnel_elements(id, page_id)
    on delete cascade deferrable initially deferred
);

create index funnel_elements_funnel_idx on public.funnel_elements (funnel_id);
create index funnel_elements_tree_order_idx
  on public.funnel_elements (page_id, parent_id, slot, order_num, id);
create index funnel_elements_parent_idx
  on public.funnel_elements (parent_id) where parent_id is not null;

create table public.funnel_variables (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  key text not null,
  label text,
  kind text not null default 'custom'
    check (kind in ('answer', 'lead', 'system', 'utm', 'custom', 'computed')),
  default_value jsonb not null default 'null'::jsonb,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_variables_key_format check (
    char_length(key) between 1 and 128
    and key ~ '^[A-Za-z][A-Za-z0-9_.-]*$'
  ),
  constraint funnel_variables_label_length check (label is null or char_length(label) <= 160),
  constraint funnel_variables_funnel_key_unique
    unique (funnel_id, key) deferrable initially deferred
);

create index funnel_variables_funnel_idx on public.funnel_variables (funnel_id);

-- ---------------------------------------------------------------------------
-- Immutable versions and atomic publication pointer
-- ---------------------------------------------------------------------------

create table public.funnel_versions (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  version_number bigint not null check (version_number > 0),
  revision bigint not null check (revision >= 0),
  kind text not null check (kind in ('draft', 'published', 'restored')),
  label text,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source_version_id uuid references public.funnel_versions(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint funnel_versions_label_length check (label is null or char_length(label) <= 160),
  unique (funnel_id, version_number)
);

alter table public.funnels
  add constraint funnels_latest_draft_version_fkey
  foreign key (latest_draft_version_id)
  references public.funnel_versions(id) on delete set null;

alter table public.funnels
  add constraint funnels_published_version_fkey
  foreign key (published_version_id)
  references public.funnel_versions(id) on delete set null;

create index funnel_versions_funnel_created_idx
  on public.funnel_versions (funnel_id, created_at desc);
create index funnel_versions_source_idx
  on public.funnel_versions (source_version_id) where source_version_id is not null;

create table public.funnel_publications (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  version_id uuid not null references public.funnel_versions(id) on delete restrict,
  slug text not null,
  is_active boolean not null default true,
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  unpublished_at timestamptz,
  constraint funnel_publications_slug_format check (
    char_length(slug) between 1 and 120
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint funnel_publications_active_dates check (
    (is_active and unpublished_at is null)
    or (not is_active and unpublished_at is not null)
  )
);

create unique index funnel_publications_one_active_per_funnel_idx
  on public.funnel_publications (funnel_id) where is_active;
create unique index funnel_publications_active_slug_idx
  on public.funnel_publications (lower(slug)) where is_active;
create index funnel_publications_funnel_published_idx
  on public.funnel_publications (funnel_id, published_at desc);
create index funnel_publications_version_idx on public.funnel_publications (version_id);

-- ---------------------------------------------------------------------------
-- Public runtime, submissions and analytics
-- ---------------------------------------------------------------------------

create table public.funnel_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key uuid not null default gen_random_uuid() unique,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  publication_id uuid not null references public.funnel_publications(id) on delete restrict,
  version_id uuid not null references public.funnel_versions(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned', 'expired')),
  current_page_id uuid,
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object'),
  device jsonb not null default '{}'::jsonb check (jsonb_typeof(device) = 'object'),
  lead jsonb not null default '{}'::jsonb check (jsonb_typeof(lead) = 'object'),
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint funnel_sessions_completion_time check (
    status <> 'completed' or completed_at is not null
  )
);

create index funnel_sessions_funnel_started_idx
  on public.funnel_sessions (funnel_id, started_at desc);
create index funnel_sessions_funnel_status_last_seen_idx
  on public.funnel_sessions (funnel_id, status, last_seen_at desc);
create index funnel_sessions_publication_idx on public.funnel_sessions (publication_id);
create index funnel_sessions_version_idx on public.funnel_sessions (version_id);
create index funnel_sessions_expires_idx
  on public.funnel_sessions (expires_at) where status = 'active';

create table public.funnel_submissions (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  session_id uuid not null references public.funnel_sessions(id) on delete cascade,
  version_id uuid not null references public.funnel_versions(id) on delete restrict,
  name text,
  email text,
  phone text,
  lead jsonb not null default '{}'::jsonb check (jsonb_typeof(lead) = 'object'),
  score numeric,
  result_key text,
  submitted_at timestamptz not null default now(),
  constraint funnel_submissions_name_length check (name is null or char_length(name) <= 240),
  constraint funnel_submissions_email_length check (email is null or char_length(email) <= 320),
  constraint funnel_submissions_phone_length check (phone is null or char_length(phone) <= 64),
  constraint funnel_submissions_result_key_length check (result_key is null or char_length(result_key) <= 160),
  unique (session_id)
);

create index funnel_submissions_funnel_submitted_idx
  on public.funnel_submissions (funnel_id, submitted_at desc);
create index funnel_submissions_version_idx on public.funnel_submissions (version_id);
create index funnel_submissions_email_idx
  on public.funnel_submissions (funnel_id, lower(email)) where email is not null;
create index funnel_submissions_phone_idx
  on public.funnel_submissions (funnel_id, phone) where phone is not null;

create table public.funnel_submission_values (
  id bigint generated always as identity primary key,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  submission_id uuid not null references public.funnel_submissions(id) on delete cascade,
  element_id uuid,
  field_key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  constraint funnel_submission_values_key_length check (char_length(field_key) between 1 and 128),
  unique (submission_id, field_key)
);

create index funnel_submission_values_funnel_field_idx
  on public.funnel_submission_values (funnel_id, field_key);
create index funnel_submission_values_submission_idx
  on public.funnel_submission_values (submission_id);

create table public.funnel_events (
  id bigint generated always as identity primary key,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  session_id uuid not null references public.funnel_sessions(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  page_id uuid,
  element_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint funnel_events_key_length check (char_length(event_key) between 1 and 160),
  constraint funnel_events_type_format check (
    char_length(event_type) between 1 and 64
    and event_type ~ '^[a-z][a-z0-9_.:-]*$'
  ),
  unique (session_id, event_key)
);

create index funnel_events_funnel_occurred_idx
  on public.funnel_events (funnel_id, occurred_at desc);
create index funnel_events_funnel_type_occurred_idx
  on public.funnel_events (funnel_id, event_type, occurred_at desc);
create index funnel_events_session_idx on public.funnel_events (session_id);

-- ---------------------------------------------------------------------------
-- Tenant authorization helpers. They live outside the exposed API schema and
-- explicitly bind every decision to auth.uid().
-- ---------------------------------------------------------------------------

create or replace function private.is_funnel_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and (
          w.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = w.id
              and wm.user_id = (select auth.uid())
          )
        )
    );
$$;

create or replace function private.is_funnel_member(p_funnel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.funnels f
      where f.id = p_funnel_id
        and private.is_funnel_workspace_member(f.workspace_id)
    );
$$;

-- Used only from the private submission-upload Storage policy. A random UUID
-- session key is the bearer capability; it is never returned by table reads.
create or replace function private.can_upload_to_funnel_session(
  p_funnel_id uuid,
  p_session_key uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.funnel_sessions s
    join public.funnel_publications p on p.id = s.publication_id
    where s.funnel_id = p_funnel_id
      and s.session_key = p_session_key
      and s.status = 'active'
      and s.expires_at > now()
      and p.is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: every V2 table is enabled. Direct Data API access is read-only for
-- authenticated workspace members. Public runtime access is through narrow
-- RPCs, so a draft can never be selected anonymously.
-- ---------------------------------------------------------------------------

alter table public.funnels enable row level security;
alter table public.funnel_pages enable row level security;
alter table public.funnel_elements enable row level security;
alter table public.funnel_variables enable row level security;
alter table public.funnel_versions enable row level security;
alter table public.funnel_publications enable row level security;
alter table public.funnel_sessions enable row level security;
alter table public.funnel_submissions enable row level security;
alter table public.funnel_submission_values enable row level security;
alter table public.funnel_events enable row level security;

create policy funnels_member_select on public.funnels
  for select to authenticated
  using ((select private.is_funnel_workspace_member(workspace_id)));

create policy funnel_pages_member_select on public.funnel_pages
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_elements_member_select on public.funnel_elements
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_variables_member_select on public.funnel_variables
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_versions_member_select on public.funnel_versions
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_publications_member_select on public.funnel_publications
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_sessions_member_select on public.funnel_sessions
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_submissions_member_select on public.funnel_submissions
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_submission_values_member_select on public.funnel_submission_values
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

create policy funnel_events_member_select on public.funnel_events
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

-- Explicit grants are required on projects using the 2026 opt-in Data API
-- exposure defaults. RLS remains a separate authorization layer.
revoke all on table
  public.funnels,
  public.funnel_pages,
  public.funnel_elements,
  public.funnel_variables,
  public.funnel_versions,
  public.funnel_publications,
  public.funnel_sessions,
  public.funnel_submissions,
  public.funnel_submission_values,
  public.funnel_events
from anon, authenticated;

grant select on table
  public.funnels,
  public.funnel_pages,
  public.funnel_elements,
  public.funnel_variables,
  public.funnel_versions,
  public.funnel_publications,
  public.funnel_sessions,
  public.funnel_submissions,
  public.funnel_submission_values,
  public.funnel_events
to authenticated;

grant select, insert, update, delete on table
  public.funnels,
  public.funnel_pages,
  public.funnel_elements,
  public.funnel_variables,
  public.funnel_versions,
  public.funnel_publications,
  public.funnel_sessions,
  public.funnel_submissions,
  public.funnel_submission_values,
  public.funnel_events
to service_role;

grant usage, select on sequence
  public.funnel_submission_values_id_seq,
  public.funnel_events_id_seq
to service_role;

-- ---------------------------------------------------------------------------
-- Canonical document codec
-- ---------------------------------------------------------------------------

create or replace function private.normalize_funnel_slug(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(p_value, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function private.build_funnel_snapshot(p_funnel_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_funnel public.funnels%rowtype;
  v_pages jsonb;
  v_elements jsonb;
  v_variables jsonb;
begin
  select * into v_funnel
  from public.funnels
  where id = p_funnel_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Funnel not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'slug', p.slug,
        'order', p.order_num,
        'settings', p.settings
      ) order by p.order_num, p.id
    ),
    '[]'::jsonb
  ) into v_pages
  from public.funnel_pages p
  where p.funnel_id = p_funnel_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'type', e.type,
        'pageId', e.page_id,
        'parentId', e.parent_id,
        'slot', e.slot,
        'order', e.order_num,
        'content', e.content,
        'styles', e.styles,
        'logic', e.logic
      ) order by p.order_num, e.page_id, e.parent_id nulls first, e.slot, e.order_num, e.id
    ),
    '[]'::jsonb
  ) into v_elements
  from public.funnel_elements e
  join public.funnel_pages p on p.id = e.page_id
  where e.funnel_id = p_funnel_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'key', v.key,
        'label', v.label,
        'kind', v.kind,
        'value', v.default_value,
        'settings', v.settings
      ) order by v.key, v.id
    ),
    '[]'::jsonb
  ) into v_variables
  from public.funnel_variables v
  where v.funnel_id = p_funnel_id;

  return jsonb_build_object(
    'schemaVersion', 2,
    'funnelId', v_funnel.id,
    'title', v_funnel.name,
    'slug', v_funnel.slug,
    'settings', v_funnel.settings,
    'pages', v_pages,
    'elements', v_elements,
    'variables', v_variables
  );
end;
$$;

create or replace function private.apply_funnel_document(
  p_funnel_id uuid,
  p_document jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pages jsonb;
  v_elements jsonb;
  v_variables jsonb;
  v_title text;
  v_slug text;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object' then
    raise exception using errcode = '22023', message = 'Document must be a JSON object';
  end if;

  if p_document ? 'schemaVersion'
     and (p_document->>'schemaVersion')::integer <> 2 then
    raise exception using errcode = '22023', message = 'Unsupported funnel document schema version';
  end if;

  if p_document ? 'funnelId'
     and (p_document->>'funnelId')::uuid <> p_funnel_id then
    raise exception using errcode = '22023', message = 'Document funnelId does not match target funnel';
  end if;

  v_pages := coalesce(p_document->'pages', '[]'::jsonb);
  v_elements := coalesce(p_document->'elements', '[]'::jsonb);
  v_variables := coalesce(p_document->'variables', '[]'::jsonb);

  if jsonb_typeof(v_pages) <> 'array'
     or jsonb_typeof(v_elements) <> 'array'
     or jsonb_typeof(v_variables) <> 'array' then
    raise exception using errcode = '22023', message = 'pages, elements and variables must be arrays';
  end if;

  if jsonb_array_length(v_pages) < 1 or jsonb_array_length(v_pages) > 100 then
    raise exception using errcode = '22023', message = 'A funnel must contain between 1 and 100 pages';
  end if;

  if jsonb_array_length(v_elements) > 5000 then
    raise exception using errcode = '22023', message = 'A funnel cannot contain more than 5000 elements';
  end if;

  if jsonb_array_length(v_variables) > 500 then
    raise exception using errcode = '22023', message = 'A funnel cannot contain more than 500 variables';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_pages) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'id')
      or not (item ? 'name')
      or not (item ? 'slug')
  ) then
    raise exception using errcode = '22023', message = 'Every page requires id, name and slug';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_elements) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'id')
      or not (item ? 'pageId')
      or not (item ? 'type')
  ) then
    raise exception using errcode = '22023', message = 'Every element requires id, pageId and type';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_variables) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'id')
      or not (item ? 'key')
  ) then
    raise exception using errcode = '22023', message = 'Every variable requires id and key';
  end if;

  -- Casts intentionally happen during validation so malformed UUIDs fail the
  -- whole transaction before any authoring row is touched.
  if (
    select count(*) <> count(distinct (item->>'id')::uuid)
    from jsonb_array_elements(v_pages) item
  ) then
    raise exception using errcode = '22023', message = 'Page ids must be unique';
  end if;

  if (
    select count(*) <> count(distinct lower(item->>'slug'))
    from jsonb_array_elements(v_pages) item
  ) then
    raise exception using errcode = '22023', message = 'Page slugs must be unique';
  end if;

  if (
    select count(*) <> count(distinct (item->>'id')::uuid)
    from jsonb_array_elements(v_elements) item
  ) then
    raise exception using errcode = '22023', message = 'Element ids must be unique';
  end if;

  if (
    select count(*) <> count(distinct (item->>'id')::uuid)
    from jsonb_array_elements(v_variables) item
  ) then
    raise exception using errcode = '22023', message = 'Variable ids must be unique';
  end if;

  if (
    select count(*) <> count(distinct item->>'key')
    from jsonb_array_elements(v_variables) item
  ) then
    raise exception using errcode = '22023', message = 'Variable keys must be unique';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_pages) item
    join public.funnel_pages p on p.id = (item->>'id')::uuid
    where p.funnel_id <> p_funnel_id
  ) or exists (
    select 1
    from jsonb_array_elements(v_elements) item
    join public.funnel_elements e on e.id = (item->>'id')::uuid
    where e.funnel_id <> p_funnel_id
  ) or exists (
    select 1
    from jsonb_array_elements(v_variables) item
    join public.funnel_variables v on v.id = (item->>'id')::uuid
    where v.funnel_id <> p_funnel_id
  ) then
    raise exception using errcode = '42501', message = 'Document contains an id owned by another funnel';
  end if;

  if exists (
    with input_pages as (
      select (item->>'id')::uuid as id
      from jsonb_array_elements(v_pages) item
    )
    select 1
    from jsonb_array_elements(v_elements) item
    left join input_pages p on p.id = (item->>'pageId')::uuid
    where p.id is null
  ) then
    raise exception using errcode = '23503', message = 'Every element must reference a page in the document';
  end if;

  if exists (
    with input_elements as (
      select
        (item->>'id')::uuid as id,
        (item->>'pageId')::uuid as page_id,
        nullif(item->>'parentId', '')::uuid as parent_id
      from jsonb_array_elements(v_elements) item
    )
    select 1
    from input_elements child
    left join input_elements parent on parent.id = child.parent_id
    where child.parent_id is not null
      and (parent.id is null or parent.page_id <> child.page_id)
  ) then
    raise exception using errcode = '23503', message = 'Element parent must exist on the same page';
  end if;

  if exists (
    with recursive input_elements as (
      select
        (item->>'id')::uuid as id,
        nullif(item->>'parentId', '')::uuid as parent_id
      from jsonb_array_elements(v_elements) item
    ), walk as (
      select id, parent_id, array[id] as path, false as is_cycle
      from input_elements
      union all
      select w.id, parent.parent_id, w.path || parent.id, parent.id = any(w.path)
      from walk w
      join input_elements parent on parent.id = w.parent_id
      where w.parent_id is not null and not w.is_cycle
    )
    select 1 from walk where is_cycle
  ) then
    raise exception using errcode = '23514', message = 'Element hierarchy cannot contain cycles';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_elements) item
    where jsonb_typeof(coalesce(item->'content', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(item->'styles', jsonb_build_object('desktop', '{}'::jsonb))) <> 'object'
       or jsonb_typeof(coalesce(item->'logic', '{}'::jsonb)) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'Element content, styles and logic must be objects';
  end if;

  insert into public.funnel_pages (
    id, funnel_id, name, slug, order_num, settings, updated_at
  )
  select
    (item->>'id')::uuid,
    p_funnel_id,
    left(trim(item->>'name'), 160),
    item->>'slug',
    coalesce(nullif(item->>'order', '')::integer, ordinality::integer - 1),
    coalesce(item->'settings', '{}'::jsonb),
    now()
  from jsonb_array_elements(v_pages) with ordinality as pages(item, ordinality)
  on conflict (id) do update set
    name = excluded.name,
    slug = excluded.slug,
    order_num = excluded.order_num,
    settings = excluded.settings,
    updated_at = excluded.updated_at
  where (
    public.funnel_pages.name,
    public.funnel_pages.slug,
    public.funnel_pages.order_num,
    public.funnel_pages.settings
  ) is distinct from (
    excluded.name,
    excluded.slug,
    excluded.order_num,
    excluded.settings
  );

  insert into public.funnel_elements (
    id, funnel_id, page_id, parent_id, slot, order_num, type,
    content, styles, logic, updated_at
  )
  select
    (item->>'id')::uuid,
    p_funnel_id,
    (item->>'pageId')::uuid,
    nullif(item->>'parentId', '')::uuid,
    coalesce(nullif(item->>'slot', ''), 'default'),
    coalesce(nullif(item->>'order', '')::integer, ordinality::integer - 1),
    item->>'type',
    coalesce(item->'content', '{}'::jsonb),
    coalesce(item->'styles', jsonb_build_object('desktop', '{}'::jsonb)),
    coalesce(item->'logic', '{}'::jsonb),
    now()
  from jsonb_array_elements(v_elements) with ordinality as elements(item, ordinality)
  on conflict (id) do update set
    page_id = excluded.page_id,
    parent_id = excluded.parent_id,
    slot = excluded.slot,
    order_num = excluded.order_num,
    type = excluded.type,
    content = excluded.content,
    styles = excluded.styles,
    logic = excluded.logic,
    updated_at = excluded.updated_at
  where (
    public.funnel_elements.page_id,
    public.funnel_elements.parent_id,
    public.funnel_elements.slot,
    public.funnel_elements.order_num,
    public.funnel_elements.type,
    public.funnel_elements.content,
    public.funnel_elements.styles,
    public.funnel_elements.logic
  ) is distinct from (
    excluded.page_id,
    excluded.parent_id,
    excluded.slot,
    excluded.order_num,
    excluded.type,
    excluded.content,
    excluded.styles,
    excluded.logic
  );

  insert into public.funnel_variables (
    id, funnel_id, key, label, kind, default_value, settings, updated_at
  )
  select
    (item->>'id')::uuid,
    p_funnel_id,
    item->>'key',
    nullif(left(coalesce(item->>'label', ''), 160), ''),
    coalesce(nullif(item->>'kind', ''), 'custom'),
    coalesce(item->'value', 'null'::jsonb),
    coalesce(item->'settings', '{}'::jsonb),
    now()
  from jsonb_array_elements(v_variables) item
  on conflict (id) do update set
    key = excluded.key,
    label = excluded.label,
    kind = excluded.kind,
    default_value = excluded.default_value,
    settings = excluded.settings,
    updated_at = excluded.updated_at
  where (
    public.funnel_variables.key,
    public.funnel_variables.label,
    public.funnel_variables.kind,
    public.funnel_variables.default_value,
    public.funnel_variables.settings
  ) is distinct from (
    excluded.key,
    excluded.label,
    excluded.kind,
    excluded.default_value,
    excluded.settings
  );

  delete from public.funnel_elements existing
  where existing.funnel_id = p_funnel_id
    and not exists (
      select 1 from jsonb_array_elements(v_elements) item
      where (item->>'id')::uuid = existing.id
    );

  delete from public.funnel_pages existing
  where existing.funnel_id = p_funnel_id
    and not exists (
      select 1 from jsonb_array_elements(v_pages) item
      where (item->>'id')::uuid = existing.id
    );

  delete from public.funnel_variables existing
  where existing.funnel_id = p_funnel_id
    and not exists (
      select 1 from jsonb_array_elements(v_variables) item
      where (item->>'id')::uuid = existing.id
    );

  v_title := nullif(trim(p_document->>'title'), '');
  v_slug := nullif(trim(p_document->>'slug'), '');

  update public.funnels
  set name = coalesce(left(v_title, 160), name),
      slug = coalesce(v_slug, slug),
      settings = coalesce(p_document->'settings', settings),
      updated_at = now()
  where id = p_funnel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated authoring RPC implementations
-- ---------------------------------------------------------------------------

create or replace function private.can_manage_funnel_workspace_impl(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_funnel_workspace_member(p_workspace_id);
$$;

create or replace function private.create_funnel_impl(
  p_workspace_id uuid,
  p_name text,
  p_description text default null,
  p_slug text default null
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
  v_page_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_base_slug text;
  v_slug text;
  v_attempt integer := 0;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not private.is_funnel_workspace_member(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace access denied';
  end if;

  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 160 then
    raise exception using errcode = '22023', message = 'Funnel name must contain between 1 and 160 characters';
  end if;

  if p_description is not null and char_length(p_description) > 2000 then
    raise exception using errcode = '22023', message = 'Funnel description cannot exceed 2000 characters';
  end if;

  v_base_slug := private.normalize_funnel_slug(coalesce(nullif(p_slug, ''), p_name));
  if v_base_slug = '' then
    v_base_slug := 'funnel';
  end if;
  v_base_slug := left(v_base_slug, 108);

  loop
    v_slug := case
      when v_attempt = 0 then v_base_slug
      else v_base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
    end;

    exit when not exists (
      select 1 from public.funnels f where lower(f.slug) = lower(v_slug)
    );

    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception using errcode = '23505', message = 'Could not allocate a unique funnel slug';
    end if;
  end loop;

  insert into public.funnels (
    id, workspace_id, name, description, slug, created_by
  ) values (
    v_funnel_id, p_workspace_id, trim(p_name), nullif(trim(p_description), ''), v_slug, v_user_id
  );

  insert into public.funnel_pages (
    id, funnel_id, name, slug, order_num, settings
  ) values (
    v_page_id, v_funnel_id, 'Boas-vindas', 'boas-vindas', 0, '{}'::jsonb
  );

  v_snapshot := private.build_funnel_snapshot(v_funnel_id);

  insert into public.funnel_versions (
    id, funnel_id, version_number, revision, kind, label, snapshot, created_by
  ) values (
    v_version_id, v_funnel_id, 1, 0, 'draft', 'Versão inicial', v_snapshot, v_user_id
  );

  update public.funnels
  set latest_draft_version_id = v_version_id
  where id = v_funnel_id;

  return query select v_funnel_id, 0::bigint, v_slug;
end;
$$;

create or replace function private.get_funnel_draft_impl(p_funnel_id uuid)
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

  if not private.is_funnel_member(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  select * into v_funnel from public.funnels where id = p_funnel_id;

  return jsonb_build_object(
    'revision', v_funnel.draft_revision,
    'publishedRevision', v_funnel.published_revision,
    'latestDraftVersionId', v_funnel.latest_draft_version_id,
    'publishedVersionId', v_funnel.published_version_id,
    'status', v_funnel.status,
    'document', private.build_funnel_snapshot(p_funnel_id)
  );
end;
$$;

create or replace function private.save_funnel_draft_impl(
  p_funnel_id uuid,
  p_expected_revision bigint,
  p_document jsonb,
  p_label text default null
)
returns table (
  funnel_id uuid,
  revision bigint,
  version_id uuid,
  saved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_funnel public.funnels%rowtype;
  v_revision bigint;
  v_version_number bigint;
  v_version_id uuid := gen_random_uuid();
  v_saved_at timestamptz := now();
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'Expected revision is required';
  end if;

  if p_document is null or octet_length(p_document::text) > 900000 then
    raise exception using errcode = '22023', message = 'Funnel document exceeds the 900 KB save limit';
  end if;

  if p_label is not null and char_length(p_label) > 160 then
    raise exception using errcode = '22023', message = 'Version label cannot exceed 160 characters';
  end if;

  select * into v_funnel
  from public.funnels
  where id = p_funnel_id
  for update;

  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  if v_funnel.status = 'archived' then
    raise exception using errcode = '55000', message = 'Archived funnels cannot be edited';
  end if;

  if v_funnel.draft_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'Funnel draft changed in another session',
      detail = format('expected=%s actual=%s', p_expected_revision, v_funnel.draft_revision),
      hint = 'Reload the latest draft before saving again';
  end if;

  perform private.apply_funnel_document(p_funnel_id, p_document);

  v_revision := v_funnel.draft_revision + 1;
  update public.funnels
  set draft_revision = v_revision,
      updated_at = v_saved_at
  where id = p_funnel_id;

  v_snapshot := private.build_funnel_snapshot(p_funnel_id);
  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.funnel_versions v
  where v.funnel_id = p_funnel_id;

  insert into public.funnel_versions (
    id, funnel_id, version_number, revision, kind, label,
    snapshot, created_by, created_at
  ) values (
    v_version_id, p_funnel_id, v_version_number, v_revision, 'draft',
    nullif(trim(p_label), ''), v_snapshot, v_user_id, v_saved_at
  );

  update public.funnels
  set latest_draft_version_id = v_version_id
  where id = p_funnel_id;

  return query select p_funnel_id, v_revision, v_version_id, v_saved_at;
end;
$$;

create or replace function private.publish_funnel_impl(
  p_funnel_id uuid,
  p_expected_revision bigint,
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
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_funnel public.funnels%rowtype;
  v_version_number bigint;
  v_version_id uuid := gen_random_uuid();
  v_publication_id uuid := gen_random_uuid();
  v_slug text;
  v_published_at timestamptz := now();
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_funnel
  from public.funnels
  where id = p_funnel_id
  for update;

  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  if v_funnel.status = 'archived' then
    raise exception using errcode = '55000', message = 'Archived funnels cannot be published';
  end if;

  if v_funnel.draft_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'Funnel draft changed in another session',
      detail = format('expected=%s actual=%s', p_expected_revision, v_funnel.draft_revision),
      hint = 'Reload the latest draft before publishing';
  end if;

  if not exists (select 1 from public.funnel_pages p where p.funnel_id = p_funnel_id) then
    raise exception using errcode = '23514', message = 'A funnel needs at least one page before publishing';
  end if;

  v_slug := case
    when nullif(trim(p_slug), '') is null then v_funnel.slug
    else private.normalize_funnel_slug(p_slug)
  end;

  if v_slug = '' or char_length(v_slug) > 120 then
    raise exception using errcode = '22023', message = 'Invalid publication slug';
  end if;

  update public.funnels set slug = v_slug, updated_at = v_published_at
  where id = p_funnel_id;

  v_snapshot := private.build_funnel_snapshot(p_funnel_id);
  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.funnel_versions v
  where v.funnel_id = p_funnel_id;

  insert into public.funnel_versions (
    id, funnel_id, version_number, revision, kind, label,
    snapshot, created_by, created_at
  ) values (
    v_version_id, p_funnel_id, v_version_number, v_funnel.draft_revision,
    'published', 'Publicação', v_snapshot, v_user_id, v_published_at
  );

  update public.funnel_publications
  set is_active = false, unpublished_at = v_published_at
  where funnel_publications.funnel_id = p_funnel_id and is_active;

  insert into public.funnel_publications (
    id, funnel_id, version_id, slug, is_active, published_by, published_at
  ) values (
    v_publication_id, p_funnel_id, v_version_id, v_slug, true, v_user_id, v_published_at
  );

  update public.funnels
  set status = 'published',
      published_revision = v_funnel.draft_revision,
      published_version_id = v_version_id,
      updated_at = v_published_at
  where id = p_funnel_id;

  return query select
    p_funnel_id,
    v_funnel.draft_revision,
    v_version_id,
    v_publication_id,
    v_slug,
    v_published_at;
end;
$$;

create or replace function private.restore_funnel_version_impl(
  p_funnel_id uuid,
  p_version_id uuid,
  p_expected_revision bigint
)
returns table (
  funnel_id uuid,
  revision bigint,
  version_id uuid,
  restored_from_version_id uuid,
  saved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_funnel public.funnels%rowtype;
  v_source public.funnel_versions%rowtype;
  v_revision bigint;
  v_version_number bigint;
  v_version_id uuid := gen_random_uuid();
  v_saved_at timestamptz := now();
  v_document jsonb;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_funnel
  from public.funnels
  where id = p_funnel_id
  for update;

  if not found or not private.is_funnel_workspace_member(v_funnel.workspace_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  if v_funnel.status = 'archived' then
    raise exception using errcode = '55000', message = 'Archived funnels cannot be restored';
  end if;

  if v_funnel.draft_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'Funnel draft changed in another session',
      detail = format('expected=%s actual=%s', p_expected_revision, v_funnel.draft_revision),
      hint = 'Reload the latest draft before restoring a version';
  end if;

  select * into v_source
  from public.funnel_versions
  where id = p_version_id and funnel_versions.funnel_id = p_funnel_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Funnel version not found';
  end if;

  -- Restoring content must not unexpectedly reclaim an old public URL. The
  -- current slug stays in the draft until the user explicitly changes it.
  v_document := jsonb_set(
    v_source.snapshot,
    '{slug}',
    to_jsonb(v_funnel.slug),
    true
  );

  perform private.apply_funnel_document(p_funnel_id, v_document);

  v_revision := v_funnel.draft_revision + 1;
  update public.funnels
  set draft_revision = v_revision, updated_at = v_saved_at
  where id = p_funnel_id;

  v_snapshot := private.build_funnel_snapshot(p_funnel_id);
  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.funnel_versions v
  where v.funnel_id = p_funnel_id;

  insert into public.funnel_versions (
    id, funnel_id, version_number, revision, kind, label, snapshot,
    source_version_id, created_by, created_at
  ) values (
    v_version_id, p_funnel_id, v_version_number, v_revision, 'restored',
    format('Restaurada da versão %s', v_source.version_number),
    v_snapshot, p_version_id, v_user_id, v_saved_at
  );

  update public.funnels
  set latest_draft_version_id = v_version_id
  where id = p_funnel_id;

  return query select
    p_funnel_id, v_revision, v_version_id, p_version_id, v_saved_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public runtime RPC implementations. These functions deliberately expose no
-- draft tables. A session is pinned to the immutable version that was active
-- when it started, so later publications cannot alter an in-flight response.
-- ---------------------------------------------------------------------------

create or replace function private.get_published_funnel_impl(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if nullif(trim(p_slug), '') is null or char_length(p_slug) > 120 then
    return null;
  end if;

  select jsonb_build_object(
    'funnelId', p.funnel_id,
    'publicationId', p.id,
    'versionId', p.version_id,
    'slug', p.slug,
    'publishedAt', p.published_at,
    'snapshot', v.snapshot
  ) into v_result
  from public.funnel_publications p
  join public.funnel_versions v on v.id = p.version_id
  join public.funnels f on f.id = p.funnel_id
  where lower(p.slug) = lower(trim(p_slug))
    and p.is_active
    and f.status = 'published'
  order by p.published_at desc
  limit 1;

  return v_result;
end;
$$;

create or replace function private.start_funnel_session_impl(
  p_slug text,
  p_session_key uuid default null,
  p_utm jsonb default '{}'::jsonb,
  p_device jsonb default '{}'::jsonb
)
returns table (
  session_key uuid,
  funnel_id uuid,
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
  if nullif(trim(p_slug), '') is null or char_length(p_slug) > 120 then
    raise exception using errcode = '22023', message = 'Invalid funnel slug';
  end if;

  if jsonb_typeof(coalesce(p_utm, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_device, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_utm, '{}'::jsonb)::text) > 16000
     or octet_length(coalesce(p_device, '{}'::jsonb)::text) > 16000 then
    raise exception using errcode = '22023', message = 'Invalid session metadata';
  end if;

  select p.* into v_publication
  from public.funnel_publications p
  join public.funnels f on f.id = p.funnel_id
  where lower(p.slug) = lower(trim(p_slug))
    and p.is_active
    and f.status = 'published'
  order by p.published_at desc
  limit 1;

  if not found then
    raise exception using errcode = 'P0002', message = 'Published funnel not found';
  end if;

  select * into v_session
  from public.funnel_sessions s
  where s.session_key = v_key
  for update;

  if found then
    if v_session.funnel_id <> v_publication.funnel_id then
      raise exception using errcode = '22023', message = 'Session key belongs to another funnel';
    end if;

    update public.funnel_sessions
    set last_seen_at = now(),
        status = case
          when status = 'active' and expires_at <= now() then 'expired'
          else status
        end
    where id = v_session.id
    returning * into v_session;

    return query select
      v_session.session_key,
      v_session.funnel_id,
      v_session.version_id,
      v_session.expires_at;
    return;
  end if;

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

  return query select
    v_session.session_key,
    v_session.funnel_id,
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
  v_inserted boolean;
begin
  if p_session_key is null
     or nullif(trim(p_event_key), '') is null
     or char_length(p_event_key) > 160
     or p_event_type !~ '^[a-z][a-z0-9_.:-]{0,63}$' then
    raise exception using errcode = '22023', message = 'Invalid funnel event';
  end if;

  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 32000 then
    raise exception using errcode = '22023', message = 'Invalid event payload';
  end if;

  select * into v_session
  from public.funnel_sessions s
  where s.session_key = p_session_key
  for update;

  if not found or v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '55000', message = 'Funnel session is not active';
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
      current_page_id = coalesce(p_page_id, current_page_id)
  where id = v_session.id;

  return v_inserted;
end;
$$;

create or replace function private.save_funnel_progress_impl(
  p_session_key uuid,
  p_page_id uuid default null,
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
  v_saved_at timestamptz := now();
begin
  if p_session_key is null
     or jsonb_typeof(coalesce(p_values, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_lead, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_values, '{}'::jsonb)::text) > 262144
     or octet_length(coalesce(p_lead, '{}'::jsonb)::text) > 32000 then
    raise exception using errcode = '22023', message = 'Invalid funnel progress payload';
  end if;

  select * into v_session
  from public.funnel_sessions s
  where s.session_key = p_session_key
  for update;

  if not found or v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '55000', message = 'Funnel session is not active';
  end if;

  update public.funnel_sessions
  set current_page_id = coalesce(p_page_id, current_page_id),
      values = values || coalesce(p_values, '{}'::jsonb),
      lead = lead || coalesce(p_lead, '{}'::jsonb),
      last_seen_at = v_saved_at
  where id = v_session.id;

  return v_saved_at;
end;
$$;

create or replace function private.submit_funnel_impl(
  p_session_key uuid,
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
  v_submission_id uuid := gen_random_uuid();
  v_completed_at timestamptz := now();
  v_values jsonb;
  v_lead jsonb;
  v_score numeric;
begin
  if p_session_key is null
     or jsonb_typeof(coalesce(p_values, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_lead, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_values, '{}'::jsonb)::text) > 262144
     or octet_length(coalesce(p_lead, '{}'::jsonb)::text) > 32000 then
    raise exception using errcode = '22023', message = 'Invalid submission payload';
  end if;

  if (select count(*) from jsonb_object_keys(coalesce(p_values, '{}'::jsonb))) > 250 then
    raise exception using errcode = '22023', message = 'A submission cannot contain more than 250 values';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) field_key
    where char_length(field_key) < 1 or char_length(field_key) > 128
  ) then
    raise exception using errcode = '22023', message = 'Submission field key is invalid';
  end if;

  select * into v_session
  from public.funnel_sessions s
  where s.session_key = p_session_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Funnel session not found';
  end if;

  select * into v_existing
  from public.funnel_submissions s
  where s.session_id = v_session.id;

  if found then
    return query select v_existing.id, v_existing.submitted_at;
    return;
  end if;

  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '55000', message = 'Funnel session is not active';
  end if;

  v_values := v_session.values || coalesce(p_values, '{}'::jsonb);
  v_lead := v_session.lead || coalesce(p_lead, '{}'::jsonb);

  if coalesce(v_lead->>'score', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$' then
    v_score := (v_lead->>'score')::numeric;
  end if;

  insert into public.funnel_submissions (
    id, funnel_id, session_id, version_id, name, email, phone,
    lead, score, result_key, submitted_at
  ) values (
    v_submission_id,
    v_session.funnel_id,
    v_session.id,
    v_session.version_id,
    nullif(left(trim(coalesce(v_lead->>'name', '')), 240), ''),
    nullif(left(trim(coalesce(v_lead->>'email', '')), 320), ''),
    nullif(left(trim(coalesce(v_lead->>'phone', '')), 64), ''),
    v_lead,
    v_score,
    nullif(left(trim(coalesce(v_lead->>'resultKey', '')), 160), ''),
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
      from public.funnel_versions version_row,
           jsonb_array_elements(version_row.snapshot->'elements') element
      where version_row.id = v_session.version_id
        and coalesce(
          element->'content'->>'fieldKey',
          element->'content'->>'field_key',
          element->'content'->>'key'
        ) = value_entry.key
      limit 1
    ),
    value_entry.key,
    value_entry.value
  from jsonb_each(v_values) value_entry;

  update public.funnel_sessions
  set status = 'completed',
      values = v_values,
      lead = v_lead,
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
    v_session.current_page_id,
    jsonb_build_object('submissionId', v_submission_id)
  ) on conflict (session_id, event_key) do nothing;

  return query select v_submission_id, v_completed_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exposed RPC wrappers. They remain SECURITY INVOKER; only their private,
-- non-exposed implementations use definer privileges, with explicit identity
-- and tenant checks at the beginning of every authoring mutation.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_funnel_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_manage_funnel_workspace_impl(p_workspace_id);
$$;

create or replace function public.create_funnel(
  p_workspace_id uuid,
  p_name text,
  p_description text default null,
  p_slug text default null
)
returns table (funnel_id uuid, revision bigint, slug text)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.create_funnel_impl(
    p_workspace_id, p_name, p_description, p_slug
  );
$$;

create or replace function public.get_funnel_draft(p_funnel_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_funnel_draft_impl(p_funnel_id);
$$;

create or replace function public.save_funnel_draft(
  p_funnel_id uuid,
  p_expected_revision bigint,
  p_document jsonb,
  p_label text default null
)
returns table (
  funnel_id uuid,
  revision bigint,
  version_id uuid,
  saved_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.save_funnel_draft_impl(
    p_funnel_id, p_expected_revision, p_document, p_label
  );
$$;

create or replace function public.publish_funnel(
  p_funnel_id uuid,
  p_expected_revision bigint,
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.publish_funnel_impl(
    p_funnel_id, p_expected_revision, p_slug
  );
$$;

create or replace function public.restore_funnel_version(
  p_funnel_id uuid,
  p_version_id uuid,
  p_expected_revision bigint
)
returns table (
  funnel_id uuid,
  revision bigint,
  version_id uuid,
  restored_from_version_id uuid,
  saved_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.restore_funnel_version_impl(
    p_funnel_id, p_version_id, p_expected_revision
  );
$$;

create or replace function public.get_published_funnel(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_published_funnel_impl(p_slug);
$$;

create or replace function public.start_funnel_session(
  p_slug text,
  p_session_key uuid default null,
  p_utm jsonb default '{}'::jsonb,
  p_device jsonb default '{}'::jsonb
)
returns table (
  session_key uuid,
  funnel_id uuid,
  version_id uuid,
  expires_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.start_funnel_session_impl(
    p_slug, p_session_key, p_utm, p_device
  );
$$;

create or replace function public.track_funnel_event(
  p_session_key uuid,
  p_event_key text,
  p_event_type text,
  p_page_id uuid default null,
  p_element_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.track_funnel_event_impl(
    p_session_key, p_event_key, p_event_type,
    p_page_id, p_element_id, p_payload
  );
$$;

create or replace function public.save_funnel_progress(
  p_session_key uuid,
  p_page_id uuid default null,
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
    p_session_key, p_page_id, p_values, p_lead
  );
$$;

create or replace function public.submit_funnel(
  p_session_key uuid,
  p_values jsonb default '{}'::jsonb,
  p_lead jsonb default '{}'::jsonb
)
returns table (submission_id uuid, completed_at timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.submit_funnel_impl(
    p_session_key, p_values, p_lead
  );
$$;

-- Functions are executable by PUBLIC by default in Postgres. Revoke that
-- implicit surface first, then grant only the precise roles required.
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
revoke execute on function public.can_manage_funnel_workspace(uuid) from public, anon, authenticated;
revoke execute on function public.create_funnel(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.get_funnel_draft(uuid) from public, anon, authenticated;
revoke execute on function public.save_funnel_draft(uuid, bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function public.publish_funnel(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.restore_funnel_version(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.get_published_funnel(text) from public, anon, authenticated;
revoke execute on function public.start_funnel_session(text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.track_funnel_event(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_funnel_progress(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.submit_funnel(uuid, jsonb, jsonb) from public, anon, authenticated;

grant usage on schema private to anon, authenticated;

-- Helpers used by RLS/Storage policies.
grant execute on function private.is_funnel_workspace_member(uuid) to authenticated;
grant execute on function private.is_funnel_member(uuid) to authenticated;
grant execute on function private.can_upload_to_funnel_session(uuid, uuid) to anon, authenticated;

-- Private implementations are not in an exposed schema, but their wrappers
-- need EXECUTE permission while running as the caller.
grant execute on function private.can_manage_funnel_workspace_impl(uuid) to authenticated;
grant execute on function private.create_funnel_impl(uuid, text, text, text) to authenticated;
grant execute on function private.get_funnel_draft_impl(uuid) to authenticated;
grant execute on function private.save_funnel_draft_impl(uuid, bigint, jsonb, text) to authenticated;
grant execute on function private.publish_funnel_impl(uuid, bigint, text) to authenticated;
grant execute on function private.restore_funnel_version_impl(uuid, uuid, bigint) to authenticated;

grant execute on function private.get_published_funnel_impl(text) to anon, authenticated;
grant execute on function private.start_funnel_session_impl(text, uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function private.track_funnel_event_impl(uuid, text, text, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function private.save_funnel_progress_impl(uuid, uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function private.submit_funnel_impl(uuid, jsonb, jsonb) to anon, authenticated;

grant execute on function public.can_manage_funnel_workspace(uuid) to authenticated, service_role;
grant execute on function public.create_funnel(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.get_funnel_draft(uuid) to authenticated, service_role;
grant execute on function public.save_funnel_draft(uuid, bigint, jsonb, text) to authenticated, service_role;
grant execute on function public.publish_funnel(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.restore_funnel_version(uuid, uuid, bigint) to authenticated, service_role;

grant execute on function public.get_published_funnel(text) to anon, authenticated, service_role;
grant execute on function public.start_funnel_session(text, uuid, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.track_funnel_event(uuid, text, text, uuid, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.save_funnel_progress(uuid, uuid, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.submit_funnel(uuid, jsonb, jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create or replace function private.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.can_manage_funnel_storage(
  p_funnel_id uuid,
  p_workspace_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.funnels f
      where f.id = p_funnel_id
        and (p_workspace_id is null or f.workspace_id = p_workspace_id)
        and private.is_funnel_workspace_member(f.workspace_id)
    );
$$;

revoke execute on function private.safe_uuid(text) from public, anon, authenticated, service_role;
revoke execute on function private.can_manage_funnel_storage(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.safe_uuid(text) to anon, authenticated;
grant execute on function private.can_manage_funnel_storage(uuid, uuid) to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'funnel-assets',
  'funnel-assets',
  true,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/webm', 'application/pdf'
  ]::text[]
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'funnel-uploads',
  'funnel-uploads',
  false,
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/webm',
    'application/pdf', 'application/zip', 'application/octet-stream',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]::text[]
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Media-library object names are:
--   <workspace_uuid>/<funnel_uuid>/<unique_name>
create policy funnel_assets_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'funnel-assets'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[2]),
      private.safe_uuid((storage.foldername(name))[1])
    )
  );

create policy funnel_assets_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'funnel-assets'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[2]),
      private.safe_uuid((storage.foldername(name))[1])
    )
  );

create policy funnel_assets_member_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'funnel-assets'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[2]),
      private.safe_uuid((storage.foldername(name))[1])
    )
  )
  with check (
    bucket_id = 'funnel-assets'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[2]),
      private.safe_uuid((storage.foldername(name))[1])
    )
  );

create policy funnel_assets_member_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'funnel-assets'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[2]),
      private.safe_uuid((storage.foldername(name))[1])
    )
  );

-- Submission object names are:
--   <funnel_uuid>/<session_key>/<unique_name>
-- Visitors can only INSERT into their active session and cannot list/read it.
create policy funnel_uploads_session_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'funnel-uploads'
    and private.can_upload_to_funnel_session(
      private.safe_uuid((storage.foldername(name))[1]),
      private.safe_uuid((storage.foldername(name))[2])
    )
  );

create policy funnel_uploads_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'funnel-uploads'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[1]),
      null
    )
  );

create policy funnel_uploads_member_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'funnel-uploads'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[1]),
      null
    )
  )
  with check (
    bucket_id = 'funnel-uploads'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[1]),
      null
    )
  );

create policy funnel_uploads_member_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'funnel-uploads'
    and private.can_manage_funnel_storage(
      private.safe_uuid((storage.foldername(name))[1]),
      null
    )
  );
