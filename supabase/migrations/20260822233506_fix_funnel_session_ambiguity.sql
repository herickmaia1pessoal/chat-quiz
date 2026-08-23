-- Qualify session columns that share names with RETURNS TABLE output fields.
-- Without the alias, PL/pgSQL rejects the resume path as ambiguous.
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

  select publication_row.* into v_publication
  from public.funnel_publications publication_row
  join public.funnels funnel_row on funnel_row.id = publication_row.funnel_id
  where lower(publication_row.slug) = lower(trim(p_slug))
    and publication_row.is_active
    and funnel_row.status = 'published'
  order by publication_row.published_at desc
  limit 1;

  if not found then
    raise exception using errcode = 'P0002', message = 'Published funnel not found';
  end if;

  select session_row.* into v_session
  from public.funnel_sessions session_row
  where session_row.session_key = v_key
  for update;

  if found then
    if v_session.funnel_id <> v_publication.funnel_id then
      raise exception using errcode = '22023', message = 'Session key belongs to another funnel';
    end if;

    update public.funnel_sessions as session_row
    set last_seen_at = now(),
        status = case
          when session_row.status = 'active' and session_row.expires_at <= now() then 'expired'
          else session_row.status
        end
    where session_row.id = v_session.id
    returning session_row.* into v_session;

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
