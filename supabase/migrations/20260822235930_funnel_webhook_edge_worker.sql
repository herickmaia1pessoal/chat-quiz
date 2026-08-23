-- Harden webhook delivery by keeping user-controlled destinations out of the
-- database network extension. pg_net now invokes only this project's fixed
-- Edge Function, which claims one outbox row and performs guarded egress.

create or replace function private.is_safe_funnel_webhook_url(p_url text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_url is not null
    and char_length(p_url) between 12 and 2048
    -- Standard HTTPS only: no credentials, IP literals, custom ports or a
    -- trailing DNS dot. The Edge worker performs the authoritative DNS/IP
    -- checks immediately before every delivery.
    and p_url ~ '^https://(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})(?:/[^[:space:]]*)?$'
    and lower(p_url) !~ '^https://(?:localhost|metadata|metadata\.google\.internal)(?:/|$)'
    and lower(p_url) !~ '^https://(?:[^/]+\.)?(?:localtest\.me|localhost\.direct|lvh\.me|vcap\.me|nip\.io|sslip\.io)(?:/|$)';
$$;

alter table public.funnel_webhook_deliveries
  drop constraint funnel_webhook_deliveries_status_check;

alter table public.funnel_webhook_deliveries
  add constraint funnel_webhook_deliveries_status_check
    check (status in ('pending', 'processing', 'retrying', 'succeeded', 'failed')),
  add column locked_until timestamptz,
  add column last_dispatched_at timestamptz,
  add column claim_token uuid;

drop trigger if exists funnel_completion_enqueue_webhook on public.funnel_events;

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
    id, funnel_id, submission_id, event_id, status, attempt_count,
    payload, next_attempt_at
  ) values (
    v_delivery_id, v_submission.funnel_id, v_submission.id, new.id,
    'pending', 0, v_payload, now()
  ) on conflict (submission_id) do nothing;

  return new;
end;
$$;

create trigger funnel_completion_enqueue_webhook
  after insert on public.funnel_events
  for each row
  when (new.event_type = 'funnel_completed')
  execute function private.enqueue_funnel_webhook_impl();

create or replace function private.claim_funnel_webhook_delivery_impl(
  p_delivery_id uuid,
  p_worker_signature text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery public.funnel_webhook_deliveries%rowtype;
  v_integration public.funnel_integrations%rowtype;
  v_expected_signature text;
  v_payload_text text;
  v_claim_token uuid := gen_random_uuid();
begin
  select delivery_row.* into v_delivery
  from public.funnel_webhook_deliveries delivery_row
  where delivery_row.id = p_delivery_id
  for update;

  if not found then
    return null;
  end if;

  select * into v_integration
  from public.funnel_integrations integration_row
  where integration_row.funnel_id = v_delivery.funnel_id
    and integration_row.webhook_enabled;

  if not found then
    update public.funnel_webhook_deliveries
    set status = 'failed',
        last_error = 'Webhook integration is disabled',
      next_attempt_at = null,
      locked_until = null,
      claim_token = null,
        updated_at = now()
    where id = v_delivery.id
      and status in ('pending', 'processing', 'retrying');
    return null;
  end if;

  v_expected_signature := 'sha256=' || encode(
    extensions.hmac(
      convert_to(v_delivery.id::text, 'UTF8'),
      convert_to(v_integration.webhook_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if p_worker_signature is null
     or char_length(p_worker_signature) <> char_length(v_expected_signature)
     or p_worker_signature <> v_expected_signature then
    return null;
  end if;

  if v_delivery.attempt_count >= 3
     or not (
       (v_delivery.status in ('pending', 'retrying')
         and coalesce(v_delivery.next_attempt_at, now()) <= now())
       or (v_delivery.status = 'processing'
         and coalesce(v_delivery.locked_until, '-infinity'::timestamptz) <= now())
     ) then
    return null;
  end if;

  update public.funnel_webhook_deliveries
  set status = 'processing',
      attempt_count = attempt_count + 1,
      locked_until = now() + interval '2 minutes',
      claim_token = v_claim_token,
      next_attempt_at = null,
      last_error = null,
      updated_at = now()
  where id = v_delivery.id
  returning * into v_delivery;

  v_payload_text := v_delivery.payload::text;
  return jsonb_build_object(
    'deliveryId', v_delivery.id,
    'claimToken', v_claim_token,
    'attempt', v_delivery.attempt_count,
    'url', v_integration.webhook_url,
    'payloadText', v_payload_text,
    'outgoingSignature', 'sha256=' || encode(
      extensions.hmac(
        convert_to(v_payload_text, 'UTF8'),
        convert_to(v_integration.webhook_secret, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  );
end;
$$;

create or replace function private.finish_funnel_webhook_delivery_impl(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_retryable boolean,
  p_status_code integer default null,
  p_response_body text default null,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery public.funnel_webhook_deliveries%rowtype;
begin
  select * into v_delivery
  from public.funnel_webhook_deliveries delivery_row
  where delivery_row.id = p_delivery_id
    and delivery_row.claim_token = p_claim_token
  for update;

  if not found or v_delivery.status <> 'processing' then
    return;
  end if;

  if p_succeeded then
    update public.funnel_webhook_deliveries
    set status = 'succeeded',
        status_code = p_status_code,
        response_body = left(p_response_body, 8000),
        last_error = null,
        next_attempt_at = null,
        locked_until = null,
        claim_token = null,
        delivered_at = now(),
        updated_at = now()
    where id = p_delivery_id;
  elsif not coalesce(p_retryable, false) or v_delivery.attempt_count >= 3 then
    update public.funnel_webhook_deliveries
    set status = 'failed',
        status_code = p_status_code,
        response_body = left(p_response_body, 8000),
        last_error = left(coalesce(p_error, 'Webhook delivery failed'), 2000),
        next_attempt_at = null,
        locked_until = null,
        claim_token = null,
        updated_at = now()
    where id = p_delivery_id;
  else
    update public.funnel_webhook_deliveries
    set status = 'retrying',
        status_code = p_status_code,
        response_body = left(p_response_body, 8000),
        last_error = left(coalesce(p_error, 'Webhook delivery failed'), 2000),
        next_attempt_at = now() + make_interval(
          mins => case when v_delivery.attempt_count = 1 then 1 else 5 end
        ),
        locked_until = null,
        claim_token = null,
        updated_at = now()
    where id = p_delivery_id;
  end if;
end;
$$;

create or replace function private.dispatch_funnel_webhook_deliveries()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery record;
  v_request_id bigint;
  v_worker_signature text;
  v_worker_url text := coalesce(
    nullif(current_setting('app.settings.funnelflow_worker_url', true), ''),
    'https://mjavyqqdwxnanbefyrum.supabase.co/functions/v1/funnel-webhook-worker'
  );
  v_dispatched integer := 0;
begin
  for v_delivery in
    select delivery_row.id, integration_row.webhook_secret
    from public.funnel_webhook_deliveries delivery_row
    join public.funnel_integrations integration_row
      on integration_row.funnel_id = delivery_row.funnel_id
     and integration_row.webhook_enabled
    where delivery_row.attempt_count < 3
      and (
        (delivery_row.status in ('pending', 'retrying')
          and coalesce(delivery_row.next_attempt_at, now()) <= now())
        or (delivery_row.status = 'processing'
          and coalesce(delivery_row.locked_until, '-infinity'::timestamptz) <= now())
      )
      and (
        delivery_row.last_dispatched_at is null
        or delivery_row.last_dispatched_at <= now() - interval '30 seconds'
      )
    order by coalesce(delivery_row.next_attempt_at, delivery_row.created_at)
    limit 100
    for update of delivery_row skip locked
  loop
    v_worker_signature := 'sha256=' || encode(
      extensions.hmac(
        convert_to(v_delivery.id::text, 'UTF8'),
        convert_to(v_delivery.webhook_secret, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    begin
      select net.http_post(
        url := v_worker_url,
        body := jsonb_build_object('deliveryId', v_delivery.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'User-Agent', 'FunnelFlow-Dispatcher/2.0',
          'X-FunnelFlow-Worker-Signature', v_worker_signature
        ),
        timeout_milliseconds := 10000
      ) into v_request_id;

      update public.funnel_webhook_deliveries
      set request_id = v_request_id,
          last_dispatched_at = now(),
          updated_at = now()
      where id = v_delivery.id;
      v_dispatched := v_dispatched + 1;
    exception when others then
      update public.funnel_webhook_deliveries
      set last_error = left('Dispatcher: ' || sqlerrm, 2000),
          last_dispatched_at = now(),
          updated_at = now()
      where id = v_delivery.id;
    end;
  end loop;

  return v_dispatched;
end;
$$;

create or replace function private.cancel_disabled_funnel_webhooks_impl()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if old.webhook_enabled and not new.webhook_enabled then
    update public.funnel_webhook_deliveries
    set status = 'failed',
        last_error = 'Webhook integration was disabled',
        next_attempt_at = null,
        locked_until = null,
        claim_token = null,
        updated_at = now()
    where funnel_id = new.funnel_id
      and status in ('pending', 'processing', 'retrying');
  end if;
  return new;
end;
$$;

create trigger funnel_integration_cancel_pending
  after update of webhook_enabled on public.funnel_integrations
  for each row
  execute function private.cancel_disabled_funnel_webhooks_impl();

create or replace function public.claim_funnel_webhook_delivery(
  p_delivery_id uuid,
  p_worker_signature text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_funnel_webhook_delivery_impl(
    p_delivery_id,
    p_worker_signature
  );
$$;

create or replace function public.finish_funnel_webhook_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_retryable boolean,
  p_status_code integer default null,
  p_response_body text default null,
  p_error text default null
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finish_funnel_webhook_delivery_impl(
    p_delivery_id,
    p_claim_token,
    p_succeeded,
    p_retryable,
    p_status_code,
    p_response_body,
    p_error
  );
$$;

revoke all on function private.claim_funnel_webhook_delivery_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.finish_funnel_webhook_delivery_impl(uuid, uuid, boolean, boolean, integer, text, text) from public, anon, authenticated;
revoke all on function private.dispatch_funnel_webhook_deliveries() from public, anon, authenticated;
revoke all on function private.cancel_disabled_funnel_webhooks_impl() from public, anon, authenticated;
revoke all on function public.claim_funnel_webhook_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_funnel_webhook_delivery(uuid, uuid, boolean, boolean, integer, text, text) from public, anon, authenticated;

grant execute on function private.claim_funnel_webhook_delivery_impl(uuid, text) to service_role;
grant execute on function private.finish_funnel_webhook_delivery_impl(uuid, uuid, boolean, boolean, integer, text, text) to service_role;
grant execute on function public.claim_funnel_webhook_delivery(uuid, text) to service_role;
grant execute on function public.finish_funnel_webhook_delivery(uuid, uuid, boolean, boolean, integer, text, text) to service_role;

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
  'select private.dispatch_funnel_webhook_deliveries();'
);

drop function if exists private.process_funnel_webhook_deliveries();
