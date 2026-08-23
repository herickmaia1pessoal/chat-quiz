-- Funnel integrations and durable webhook delivery.
-- Secrets live outside FunnelDocument snapshots so the public renderer can
-- never disclose signing credentials.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function private.is_safe_funnel_webhook_url(p_url text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_url is not null
    and char_length(p_url) between 12 and 2048
    and p_url ~ '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:/[^[:space:]]*)?$'
    and lower(p_url) !~ '^https://(?:localhost|[^/]*\.local)(?::[0-9]+)?(?:/|$)'
    and lower(p_url) !~ '^https://(?:0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)(?:[^/]*)(?:/|$)'
    and lower(p_url) !~ '^https://(?:metadata|metadata\.google\.internal)(?::[0-9]+)?(?:/|$)'
    and lower(p_url) !~ '^https://[0-9]+(?::[0-9]+)?(?:/|$)';
$$;

create table public.funnel_integrations (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null unique references public.funnels(id) on delete cascade,
  webhook_enabled boolean not null default false,
  webhook_url text,
  webhook_secret text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_integrations_webhook_complete check (
    not webhook_enabled
    or (
      private.is_safe_funnel_webhook_url(webhook_url)
      and char_length(webhook_secret) between 16 and 160
    )
  ),
  constraint funnel_integrations_url_safe check (
    webhook_url is null or private.is_safe_funnel_webhook_url(webhook_url)
  ),
  constraint funnel_integrations_secret_length check (
    webhook_secret is null or char_length(webhook_secret) between 16 and 160
  )
);

create index funnel_integrations_created_by_idx on public.funnel_integrations (created_by);
create index funnel_integrations_updated_by_idx on public.funnel_integrations (updated_by);

create table public.funnel_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  submission_id uuid not null references public.funnel_submissions(id) on delete cascade,
  event_id bigint not null references public.funnel_events(id) on delete cascade,
  request_id bigint,
  status text not null default 'pending'
    check (status in ('pending', 'retrying', 'succeeded', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status_code integer,
  response_body text,
  last_error text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id),
  unique (event_id)
);

create index funnel_webhook_deliveries_funnel_created_idx
  on public.funnel_webhook_deliveries (funnel_id, created_at desc);
create index funnel_webhook_deliveries_pending_idx
  on public.funnel_webhook_deliveries (status, next_attempt_at, updated_at)
  where status in ('pending', 'retrying');
create index funnel_webhook_deliveries_request_idx
  on public.funnel_webhook_deliveries (request_id) where request_id is not null;
alter table public.funnel_integrations enable row level security;
alter table public.funnel_webhook_deliveries enable row level security;

create policy funnel_webhook_deliveries_member_select
  on public.funnel_webhook_deliveries
  for select to authenticated
  using ((select private.is_funnel_member(funnel_id)));

revoke all on table public.funnel_integrations, public.funnel_webhook_deliveries
  from anon, authenticated;
grant select on table public.funnel_webhook_deliveries to authenticated;
grant select, insert, update, delete on table
  public.funnel_integrations,
  public.funnel_webhook_deliveries
to service_role;

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
  if (select auth.uid()) is null or not private.is_funnel_member(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
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

create or replace function private.save_funnel_integration_impl(
  p_funnel_id uuid,
  p_webhook_enabled boolean,
  p_webhook_url text default null,
  p_webhook_secret text default null,
  p_rotate_secret boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.funnel_integrations%rowtype;
  v_url text := nullif(trim(p_webhook_url), '');
  v_secret text := nullif(trim(p_webhook_secret), '');
  v_has_existing boolean := false;
  v_reveal_secret boolean := false;
  v_saved public.funnel_integrations%rowtype;
begin
  if v_user_id is null or not private.is_funnel_member(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  select * into v_existing
  from public.funnel_integrations integration_row
  where integration_row.funnel_id = p_funnel_id
  for update;
  v_has_existing := found;

  if v_url is not null and not private.is_safe_funnel_webhook_url(v_url) then
    raise exception using errcode = '22023', message = 'Webhook URL must use a safe public HTTPS address';
  end if;

  if v_secret is not null and char_length(v_secret) not between 16 and 160 then
    raise exception using errcode = '22023', message = 'Webhook secret must contain between 16 and 160 characters';
  end if;

  if p_rotate_secret then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    v_reveal_secret := true;
  elsif v_secret is null and v_has_existing then
    v_secret := v_existing.webhook_secret;
  elsif v_secret is null and coalesce(p_webhook_enabled, false) then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    v_reveal_secret := true;
  end if;

  if coalesce(p_webhook_enabled, false)
     and (v_url is null or v_secret is null) then
    raise exception using errcode = '22023', message = 'Enabled webhooks require URL and signing secret';
  end if;

  insert into public.funnel_integrations (
    funnel_id, webhook_enabled, webhook_url, webhook_secret,
    created_by, updated_by, updated_at
  ) values (
    p_funnel_id, coalesce(p_webhook_enabled, false), v_url, v_secret,
    v_user_id, v_user_id, now()
  )
  on conflict (funnel_id) do update set
    webhook_enabled = excluded.webhook_enabled,
    webhook_url = excluded.webhook_url,
    webhook_secret = excluded.webhook_secret,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_saved;

  return jsonb_build_object(
    'webhookEnabled', v_saved.webhook_enabled,
    'webhookUrl', v_saved.webhook_url,
    'hasWebhookSecret', v_saved.webhook_secret is not null,
    'secretPreview', case
      when v_saved.webhook_secret is null then null
      else repeat('*', greatest(char_length(v_saved.webhook_secret) - 4, 8))
        || right(v_saved.webhook_secret, 4)
    end,
    'newSecret', case when v_reveal_secret then v_saved.webhook_secret else null end,
    'updatedAt', v_saved.updated_at
  );
end;
$$;

create or replace function private.enqueue_funnel_webhook_impl()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_integration public.funnel_integrations%rowtype;
  v_submission public.funnel_submissions%rowtype;
  v_payload jsonb;
  v_delivery_id uuid := gen_random_uuid();
  v_request_id bigint;
  v_signature text;
begin
  if new.event_type <> 'funnel_completed' then
    return new;
  end if;

  select * into v_integration
  from public.funnel_integrations integration_row
  where integration_row.funnel_id = new.funnel_id
    and integration_row.webhook_enabled;

  if not found then
    return new;
  end if;

  select * into v_submission
  from public.funnel_submissions submission_row
  where submission_row.session_id = new.session_id;

  if not found then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'event', 'funnel.completed',
    'deliveryId', v_delivery_id,
    'funnelId', v_submission.funnel_id,
    'submissionId', v_submission.id,
    'sessionId', v_submission.session_id,
    'submittedAt', v_submission.submitted_at,
    'lead', v_submission.lead,
    'score', v_submission.score,
    'resultKey', v_submission.result_key,
    'values', coalesce((
      select jsonb_object_agg(value_row.field_key, value_row.value)
      from public.funnel_submission_values value_row
      where value_row.submission_id = v_submission.id
    ), '{}'::jsonb)
  );

  insert into public.funnel_webhook_deliveries (
    id, funnel_id, submission_id, event_id, status, attempt_count, payload
  ) values (
    v_delivery_id, v_submission.funnel_id, v_submission.id, new.id, 'pending', 1, v_payload
  )
  on conflict (submission_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is null then
    return new;
  end if;

  -- Sign the exact canonical JSONB text passed to pg_net.
  v_signature := encode(
    extensions.hmac(
      convert_to(v_payload::text, 'UTF8'),
      convert_to(v_integration.webhook_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  begin
    select net.http_post(
      url := v_integration.webhook_url,
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'User-Agent', 'FunnelFlow-Webhook/1.0',
        'X-FunnelFlow-Event', 'funnel.completed',
        'X-FunnelFlow-Signature', 'sha256=' || v_signature
      ),
      timeout_milliseconds := 5000
    ) into v_request_id;

    update public.funnel_webhook_deliveries
    set request_id = v_request_id, updated_at = now()
    where id = v_delivery_id;
  exception when others then
    update public.funnel_webhook_deliveries
    set status = 'retrying',
        last_error = left(sqlerrm, 2000),
        next_attempt_at = now() + interval '1 minute',
        updated_at = now()
    where id = v_delivery_id;
  end;

  return new;
end;
$$;

create trigger funnel_completion_enqueue_webhook
  after insert on public.funnel_events
  for each row
  when (new.event_type = 'funnel_completed')
  execute function private.enqueue_funnel_webhook_impl();

create or replace function private.process_funnel_webhook_deliveries()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery public.funnel_webhook_deliveries%rowtype;
  v_integration public.funnel_integrations%rowtype;
  v_response record;
  v_request_id bigint;
  v_signature text;
  v_processed integer := 0;
begin
  -- Reconcile completed pg_net calls with the durable application log.
  for v_delivery in
    select delivery_row.*
    from public.funnel_webhook_deliveries delivery_row
    where delivery_row.status = 'pending'
      and delivery_row.request_id is not null
    order by delivery_row.updated_at
    limit 200
    for update skip locked
  loop
    select response_row.status_code,
           response_row.content,
           response_row.timed_out,
           response_row.error_msg
      into v_response
    from net._http_response response_row
    where response_row.id = v_delivery.request_id
    order by response_row.created desc
    limit 1;

    if found then
      if v_response.status_code between 200 and 299
         and coalesce(v_response.timed_out, false) = false
         and v_response.error_msg is null then
        update public.funnel_webhook_deliveries
        set status = 'succeeded',
            status_code = v_response.status_code,
            response_body = left(v_response.content, 8000),
            last_error = null,
            next_attempt_at = null,
            delivered_at = now(),
            updated_at = now()
        where id = v_delivery.id;
      elsif v_delivery.attempt_count >= 3 then
        update public.funnel_webhook_deliveries
        set status = 'failed',
            request_id = null,
            status_code = v_response.status_code,
            response_body = left(v_response.content, 8000),
            last_error = left(coalesce(v_response.error_msg, 'HTTP ' || coalesce(v_response.status_code::text, 'unknown')), 2000),
            next_attempt_at = null,
            updated_at = now()
        where id = v_delivery.id;
      else
        update public.funnel_webhook_deliveries
        set status = 'retrying',
            request_id = null,
            status_code = v_response.status_code,
            response_body = left(v_response.content, 8000),
            last_error = left(coalesce(v_response.error_msg, 'HTTP ' || coalesce(v_response.status_code::text, 'unknown')), 2000),
            next_attempt_at = now() + make_interval(mins => case v_delivery.attempt_count when 1 then 1 else 5 end),
            updated_at = now()
        where id = v_delivery.id;
      end if;
      v_processed := v_processed + 1;
    elsif v_delivery.updated_at < now() - interval '3 minutes' then
      update public.funnel_webhook_deliveries
      set status = case when attempt_count >= 3 then 'failed' else 'retrying' end,
          request_id = null,
          last_error = 'Webhook request timed out before a response was recorded',
          next_attempt_at = case when attempt_count >= 3 then null else now() end,
          updated_at = now()
      where id = v_delivery.id;
      v_processed := v_processed + 1;
    end if;
  end loop;

  -- Send retries after the reconciliation pass. Three attempts total.
  for v_delivery in
    select delivery_row.*
    from public.funnel_webhook_deliveries delivery_row
    where delivery_row.status = 'retrying'
      and delivery_row.attempt_count < 3
      and delivery_row.next_attempt_at <= now()
    order by delivery_row.next_attempt_at
    limit 100
    for update skip locked
  loop
    select * into v_integration
    from public.funnel_integrations integration_row
    where integration_row.funnel_id = v_delivery.funnel_id
      and integration_row.webhook_enabled;

    if not found then
      update public.funnel_webhook_deliveries
      set status = 'failed',
          last_error = 'Webhook integration is disabled',
          next_attempt_at = null,
          updated_at = now()
      where id = v_delivery.id;
      continue;
    end if;

    v_signature := encode(
      extensions.hmac(
        convert_to(v_delivery.payload::text, 'UTF8'),
        convert_to(v_integration.webhook_secret, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    begin
      select net.http_post(
        url := v_integration.webhook_url,
        body := v_delivery.payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'User-Agent', 'FunnelFlow-Webhook/1.0',
          'X-FunnelFlow-Event', 'funnel.completed',
          'X-FunnelFlow-Signature', 'sha256=' || v_signature,
          'X-FunnelFlow-Retry', v_delivery.attempt_count::text
        ),
        timeout_milliseconds := 5000
      ) into v_request_id;

      update public.funnel_webhook_deliveries
      set status = 'pending',
          request_id = v_request_id,
          attempt_count = attempt_count + 1,
          next_attempt_at = null,
          updated_at = now()
      where id = v_delivery.id;
    exception when others then
      update public.funnel_webhook_deliveries
      set attempt_count = attempt_count + 1,
          status = case when attempt_count + 1 >= 3 then 'failed' else 'retrying' end,
          last_error = left(sqlerrm, 2000),
          next_attempt_at = case when attempt_count + 1 >= 3 then null else now() + interval '5 minutes' end,
          updated_at = now()
      where id = v_delivery.id;
    end;
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.get_funnel_integration(p_funnel_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_funnel_integration_impl(p_funnel_id);
$$;

create or replace function public.save_funnel_integration(
  p_funnel_id uuid,
  p_webhook_enabled boolean,
  p_webhook_url text default null,
  p_webhook_secret text default null,
  p_rotate_secret boolean default false
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.save_funnel_integration_impl(
    p_funnel_id,
    p_webhook_enabled,
    p_webhook_url,
    p_webhook_secret,
    p_rotate_secret
  );
$$;

revoke all on function private.is_safe_funnel_webhook_url(text) from public, anon, authenticated;
revoke all on function private.get_funnel_integration_impl(uuid) from public, anon, authenticated;
revoke all on function private.save_funnel_integration_impl(uuid, boolean, text, text, boolean) from public, anon, authenticated;
revoke all on function private.enqueue_funnel_webhook_impl() from public, anon, authenticated;
revoke all on function private.process_funnel_webhook_deliveries() from public, anon, authenticated;
revoke all on function public.get_funnel_integration(uuid) from public, anon, authenticated;
revoke all on function public.save_funnel_integration(uuid, boolean, text, text, boolean) from public, anon, authenticated;

grant usage on schema private to authenticated, service_role;
grant execute on function private.get_funnel_integration_impl(uuid) to authenticated, service_role;
grant execute on function private.save_funnel_integration_impl(uuid, boolean, text, text, boolean) to authenticated, service_role;
grant execute on function public.get_funnel_integration(uuid) to authenticated, service_role;
grant execute on function public.save_funnel_integration(uuid, boolean, text, text, boolean) to authenticated, service_role;

-- A single lightweight worker reconciles responses and sends due retries.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'funnelflow-webhook-delivery-worker';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'funnelflow-webhook-delivery-worker',
  '* * * * *',
  'select private.process_funnel_webhook_deliveries();'
);
