-- Manual webhook test delivery.
-- Lets a workspace member send one synthetic "funnel.completed" payload to
-- the configured endpoint on demand, without waiting for a real submission.
-- Reuses the existing outbox/dispatcher/Edge worker pipeline unchanged: a
-- test delivery is just a `funnel_webhook_deliveries` row with `is_test =
-- true` and no submission/event behind it.

alter table public.funnel_webhook_deliveries
  alter column submission_id drop not null,
  alter column event_id drop not null;

alter table public.funnel_webhook_deliveries
  drop constraint funnel_webhook_deliveries_submission_id_key,
  drop constraint funnel_webhook_deliveries_event_id_key;

alter table public.funnel_webhook_deliveries
  add column is_test boolean not null default false,
  add constraint funnel_webhook_deliveries_test_shape check (
    (is_test and submission_id is null and event_id is null)
    or (not is_test and submission_id is not null and event_id is not null)
  );

create unique index funnel_webhook_deliveries_submission_id_key
  on public.funnel_webhook_deliveries (submission_id) where not is_test;
create unique index funnel_webhook_deliveries_event_id_key
  on public.funnel_webhook_deliveries (event_id) where not is_test;

-- Test deliveries are member-triggered, ad hoc noise — keep them out of the
-- "Entregas recentes" history and any future delivery analytics by default.
create index funnel_webhook_deliveries_funnel_created_real_idx
  on public.funnel_webhook_deliveries (funnel_id, created_at desc) where not is_test;

create or replace function private.test_funnel_webhook_impl(p_funnel_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_integration public.funnel_integrations%rowtype;
  v_delivery_id uuid := gen_random_uuid();
  v_payload jsonb;
  v_recent_count integer;
begin
  if v_user_id is null or not private.is_funnel_member(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  select * into v_integration
  from public.funnel_integrations integration_row
  where integration_row.funnel_id = p_funnel_id
    and integration_row.webhook_enabled;

  if not found then
    raise exception using errcode = '22023', message = 'Enable and save the webhook before sending a test';
  end if;

  -- Simple per-user throttle: at most 5 test sends per funnel per minute.
  select count(*) into v_recent_count
  from public.funnel_webhook_deliveries delivery_row
  where delivery_row.funnel_id = p_funnel_id
    and delivery_row.is_test
    and delivery_row.created_at > now() - interval '1 minute';

  if v_recent_count >= 5 then
    raise exception using errcode = '22023', message = 'Too many test sends. Wait a minute and try again.';
  end if;

  v_payload := jsonb_build_object(
    'event', 'funnel.completed',
    'deliveryId', v_delivery_id,
    'funnelId', p_funnel_id,
    'submissionId', null,
    'sessionId', null,
    'submittedAt', now(),
    'lead', jsonb_build_object('name', 'Lead de teste', 'email', 'teste@example.com', 'phone', '+5511999999999'),
    'score', 87,
    'resultKey', 'exemplo',
    'values', jsonb_build_object('exemplo_pergunta', 'Resposta de exemplo'),
    'test', true
  );

  insert into public.funnel_webhook_deliveries (
    id, funnel_id, submission_id, event_id, is_test, status, attempt_count,
    payload, next_attempt_at
  ) values (
    v_delivery_id, p_funnel_id, null, null, true, 'pending', 0, v_payload, now()
  );

  return jsonb_build_object('deliveryId', v_delivery_id, 'status', 'pending');
end;
$$;

create or replace function public.test_funnel_webhook(p_funnel_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.test_funnel_webhook_impl(p_funnel_id);
$$;

revoke all on function private.test_funnel_webhook_impl(uuid) from public, anon, authenticated;
revoke all on function public.test_funnel_webhook(uuid) from public, anon, authenticated;
grant execute on function private.test_funnel_webhook_impl(uuid) to authenticated, service_role;
grant execute on function public.test_funnel_webhook(uuid) to authenticated, service_role;

-- Let a member poll the outcome of their own test send (status + error only
-- — never the signing secret) without the "real deliveries only" filter
-- other read paths may adopt later.
create or replace function private.get_funnel_webhook_delivery_impl(
  p_funnel_id uuid,
  p_delivery_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delivery public.funnel_webhook_deliveries%rowtype;
begin
  if (select auth.uid()) is null or not private.is_funnel_member(p_funnel_id) then
    raise exception using errcode = '42501', message = 'Funnel access denied';
  end if;

  select * into v_delivery
  from public.funnel_webhook_deliveries delivery_row
  where delivery_row.id = p_delivery_id
    and delivery_row.funnel_id = p_funnel_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_delivery.id,
    'status', v_delivery.status,
    'attemptCount', v_delivery.attempt_count,
    'statusCode', v_delivery.status_code,
    'lastError', v_delivery.last_error,
    'createdAt', v_delivery.created_at,
    'deliveredAt', v_delivery.delivered_at
  );
end;
$$;

create or replace function public.get_funnel_webhook_delivery(
  p_funnel_id uuid,
  p_delivery_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_funnel_webhook_delivery_impl(p_funnel_id, p_delivery_id);
$$;

revoke all on function private.get_funnel_webhook_delivery_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_funnel_webhook_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function private.get_funnel_webhook_delivery_impl(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_funnel_webhook_delivery(uuid, uuid) to authenticated, service_role;
