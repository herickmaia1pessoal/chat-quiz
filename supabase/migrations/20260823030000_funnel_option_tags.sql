-- Tag-per-option: select/checkbox/radio/quiz_choice elements can carry an
-- optional `tag` on individual `content.options` entries (see
-- src/lib/funnel/options.ts for the shared client-side normalizer — a bare
-- string option is still `{ label, value }` with no tag, fully backward
-- compatible with every funnel authored before this migration).
--
-- Tags are derived entirely server-side inside submit_funnel_impl, from the
-- pinned snapshot + the final answers, the same way score/resultKey already
-- are — never trusted from the client. Aggregated onto a dedicated
-- `funnel_submissions.tags` column (mirrors the legacy
-- `leads_responses.tags` pattern) rather than folded into the `lead` jsonb,
-- which submit_funnel_impl already validates against a closed key whitelist.

alter table public.funnel_submissions
  add column tags text[] not null default '{}';

create index funnel_submissions_tags_idx
  on public.funnel_submissions using gin (tags);

-- Options can now be a bare string (legacy) or `{label, value, tag}`. Answer
-- validation must compare the submitted value against each option's
-- effective value: the string itself for a bare option, `.value` (falling
-- back to `.label`) for an object option. Identical to the prior definition
-- otherwise.
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
        where (
          jsonb_typeof(option_value) = 'string' and option_value = p_value
        ) or (
          jsonb_typeof(option_value) = 'object'
          and coalesce(option_value->>'value', option_value->>'label') = p_value #>> '{}'
        )
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
            where (
              jsonb_typeof(option_value) = 'string' and option_value = answer_value
            ) or (
              jsonb_typeof(option_value) = 'object'
              and coalesce(option_value->>'value', option_value->>'label') = answer_value #>> '{}'
            )
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

revoke all on function private.funnel_answer_value_is_valid(text, jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function private.derive_funnel_snapshot_tags(
  p_snapshot jsonb,
  p_answers jsonb
)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_element jsonb;
  v_option jsonb;
  v_field_key text;
  v_answer jsonb;
  v_option_value text;
  v_option_tag text;
  v_tags text[] := array[]::text[];
begin
  for v_element in
    select value from jsonb_array_elements(coalesce(p_snapshot->'elements', '[]'::jsonb))
  loop
    if v_element->>'type' not in ('select', 'checkbox', 'radio', 'quiz_choice')
       or jsonb_typeof(v_element#>'{content,options}') <> 'array' then
      continue;
    end if;

    v_field_key := coalesce(nullif(v_element->'content'->>'fieldKey', ''), v_element->>'id');
    v_answer := coalesce(p_answers, '{}'::jsonb)->v_field_key;
    if v_answer is null then
      continue;
    end if;

    for v_option in select value from jsonb_array_elements(v_element#>'{content,options}')
    loop
      if jsonb_typeof(v_option) = 'string' then
        continue; -- bare string options never carry a tag
      end if;
      if jsonb_typeof(v_option) <> 'object' then
        continue;
      end if;
      v_option_tag := nullif(trim(coalesce(v_option->>'tag', '')), '');
      if v_option_tag is null then
        continue;
      end if;
      v_option_value := coalesce(nullif(v_option->>'value', ''), v_option->>'label');
      if v_option_value is null then
        continue;
      end if;

      if (
        jsonb_typeof(v_answer) = 'array' and exists (
          select 1 from jsonb_array_elements(v_answer) answer_item
          where private.funnel_scalar_equals(answer_item, to_jsonb(v_option_value))
        )
      ) or (
        jsonb_typeof(v_answer) <> 'array'
        and private.funnel_scalar_equals(v_answer, to_jsonb(v_option_value))
      ) then
        if not (v_option_tag = any(v_tags)) then
          v_tags := array_append(v_tags, left(v_option_tag, 80));
        end if;
      end if;
    end loop;
  end loop;

  return v_tags[1:50];
end;
$$;

revoke all on function private.derive_funnel_snapshot_tags(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Re-point submit_funnel_impl to also derive and persist tags. Identical to
-- the 20260823003506 definition except for the two additions marked below.
create or replace function private.submit_funnel_impl(
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
  v_tags text[];
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
  -- Addition: derive lead-qualification tags from chosen options, same
  -- trust boundary as score/resultKey above (server-derived from the
  -- pinned snapshot, never taken from the client).
  v_tags := private.derive_funnel_snapshot_tags(v_snapshot, v_values);

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
    lead, score, result_key, tags, submitted_at
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
    coalesce(v_tags, array[]::text[]),
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

revoke all on function private.submit_funnel_impl(uuid, uuid, uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.submit_funnel_impl(uuid, uuid, uuid[], jsonb, jsonb) to anon, authenticated, service_role;

-- Publish-time structural validation (assert_funnel_snapshot_publishable)
-- must also accept object-format options — the prior version rejected any
-- non-string option outright ("Choice field options must be non-empty,
-- unique strings"), which would have made it impossible to ever publish a
-- funnel using a tagged option. Identical to the 20260823003506 definition
-- except for the options-validation block inside the per-element loop.
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
      -- An option is either a bare string (legacy) or `{label, value?, tag?}`
      -- (adds an optional lead-qualification tag — see
      -- src/lib/funnel/options.ts). Either shape must resolve to a
      -- non-empty effective value (the string itself, or `.value` falling
      -- back to `.label`) of at most 500 characters, and those effective
      -- values must be unique within the element.
      if jsonb_array_length(v_element->'content'->'options') not between 1 and 200
         or exists (
           select 1
           from jsonb_array_elements(v_element->'content'->'options') option_value
           where not (
             (jsonb_typeof(option_value) = 'string'
               and char_length(option_value #>> '{}') between 1 and 500)
             or (
               jsonb_typeof(option_value) = 'object'
               and jsonb_typeof(option_value->'label') = 'string'
               and char_length(option_value->>'label') between 1 and 500
               and (not (option_value ? 'value') or (
                 jsonb_typeof(option_value->'value') = 'string'
                 and char_length(option_value->>'value') between 1 and 500
               ))
               and (not (option_value ? 'tag') or (
                 jsonb_typeof(option_value->'tag') = 'string'
                 and char_length(option_value->>'tag') <= 80
               ))
             )
           )
         )
         or (
           select count(*) <> count(distinct coalesce(
             option_value->>'value', option_value->>'label', option_value #>> '{}'
           ))
           from jsonb_array_elements(v_element->'content'->'options') option_value
         ) then
        raise exception using errcode = '23514', message = 'Choice field options must be non-empty and have unique values';
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

revoke execute on function private.assert_funnel_snapshot_publishable(jsonb)
  from public, anon, authenticated, service_role;
