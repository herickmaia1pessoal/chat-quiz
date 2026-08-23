'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import type {
  FunnelIntegrationState,
  FunnelWebhookDeliveryRecord,
} from '@/components/funnel-workspace/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HTTPS_URL_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/\S*)?$/

interface IntegrationPayload {
  webhookEnabled: boolean
  webhookUrl?: string
  webhookSecret?: string
  rotateSecret?: boolean
}

interface RawIntegration {
  webhookEnabled?: unknown
  webhookUrl?: unknown
  hasWebhookSecret?: unknown
  secretPreview?: unknown
  newSecret?: unknown
  updatedAt?: unknown
}

async function requireFunnelAccess(funnelId: string) {
  if (!UUID_PATTERN.test(funnelId)) throw new Error('Funil invalido.')
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Nao autenticado.')

  const { data, error } = await supabase
    .from('funnels')
    .select('id')
    .eq('id', funnelId)
    .maybeSingle()
  if (error || !data) throw new Error('Funil nao encontrado ou sem permissao.')
  return supabase
}

function normalizeIntegration(value: unknown): FunnelIntegrationState & { newSecret?: string } {
  const raw = value && typeof value === 'object' ? value as RawIntegration : {}
  return {
    webhookEnabled: raw.webhookEnabled === true,
    webhookUrl: typeof raw.webhookUrl === 'string' ? raw.webhookUrl : '',
    hasWebhookSecret: raw.hasWebhookSecret === true,
    secretPreview: typeof raw.secretPreview === 'string' ? raw.secretPreview : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    ...(typeof raw.newSecret === 'string' ? { newSecret: raw.newSecret } : {}),
  }
}

export async function getFunnelIntegration(funnelId: string): Promise<FunnelIntegrationState> {
  const supabase = await requireFunnelAccess(funnelId)
  const { data, error } = await supabase.rpc('get_funnel_integration', {
    p_funnel_id: funnelId,
  })
  if (error) throw new Error(error.message)
  return normalizeIntegration(data)
}

export async function saveFunnelIntegration(
  funnelId: string,
  input: IntegrationPayload,
): Promise<{
  ok: boolean
  state?: FunnelIntegrationState
  newSecret?: string
  error?: string
}> {
  try {
    const supabase = await requireFunnelAccess(funnelId)
    if (!input || typeof input !== 'object') throw new Error('Configuracao invalida.')

    const webhookEnabled = input.webhookEnabled === true
    const webhookUrl = typeof input.webhookUrl === 'string' ? input.webhookUrl.trim() : ''
    const webhookSecret = typeof input.webhookSecret === 'string' ? input.webhookSecret.trim() : ''
    const rotateSecret = input.rotateSecret === true

    if (webhookUrl && (webhookUrl.length > 2048 || !HTTPS_URL_PATTERN.test(webhookUrl))) {
      throw new Error('Use uma URL HTTPS publica e valida.')
    }
    if (webhookSecret && (webhookSecret.length < 16 || webhookSecret.length > 160)) {
      throw new Error('O segredo deve ter entre 16 e 160 caracteres.')
    }

    const { data, error } = await supabase.rpc('save_funnel_integration', {
      p_funnel_id: funnelId,
      p_webhook_enabled: webhookEnabled,
      p_webhook_url: webhookUrl || null,
      p_webhook_secret: webhookSecret || null,
      p_rotate_secret: rotateSecret,
    })
    if (error) throw new Error(error.message)

    const saved = normalizeIntegration(data)
    revalidatePath(`/dashboard/funnels/${funnelId}/settings`)
    return {
      ok: true,
      state: saved,
      ...(saved.newSecret ? { newSecret: saved.newSecret } : {}),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel salvar a integracao.',
    }
  }
}

export async function getFunnelWebhookDeliveries(
  funnelId: string,
  limit = 10,
): Promise<FunnelWebhookDeliveryRecord[]> {
  const supabase = await requireFunnelAccess(funnelId)
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 10
  const { data, error } = await supabase
    .from('funnel_webhook_deliveries')
    .select('id, status, attempt_count, status_code, last_error, created_at, delivered_at')
    .eq('funnel_id', funnelId)
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(safeLimit)
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: String(row.id),
    status: row.status as FunnelWebhookDeliveryRecord['status'],
    attemptCount: Number(row.attempt_count),
    statusCode: row.status_code === null ? null : Number(row.status_code),
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
    createdAt: String(row.created_at),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
  }))
}

function normalizeDeliveryStatus(value: unknown): FunnelWebhookDeliveryRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string') return null
  return {
    id: raw.id,
    status: raw.status as FunnelWebhookDeliveryRecord['status'],
    attemptCount: Number(raw.attemptCount ?? 0),
    statusCode: raw.statusCode === null || raw.statusCode === undefined ? null : Number(raw.statusCode),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    createdAt: String(raw.createdAt ?? ''),
    deliveredAt: raw.deliveredAt ? String(raw.deliveredAt) : null,
  }
}

// Fires one synthetic "funnel.completed" payload through the real delivery
// pipeline (outbox row -> dispatcher -> Edge worker) so a "Enviar teste"
// click exercises the exact same path a real lead submission would.
export async function sendTestWebhook(funnelId: string): Promise<{
  ok: boolean
  deliveryId?: string
  error?: string
}> {
  try {
    const supabase = await requireFunnelAccess(funnelId)
    const { data, error } = await supabase.rpc('test_funnel_webhook', { p_funnel_id: funnelId })
    if (error) throw new Error(error.message)
    const deliveryId = data && typeof data === 'object' && typeof (data as Record<string, unknown>).deliveryId === 'string'
      ? (data as Record<string, unknown>).deliveryId as string
      : undefined
    if (!deliveryId) throw new Error('Resposta inesperada ao agendar o teste.')
    return { ok: true, deliveryId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel enviar o teste de webhook.',
    }
  }
}

export async function getFunnelWebhookDeliveryStatus(
  funnelId: string,
  deliveryId: string,
): Promise<FunnelWebhookDeliveryRecord | null> {
  const supabase = await requireFunnelAccess(funnelId)
  const { data, error } = await supabase.rpc('get_funnel_webhook_delivery', {
    p_funnel_id: funnelId,
    p_delivery_id: deliveryId,
  })
  if (error) throw new Error(error.message)
  return normalizeDeliveryStatus(data)
}
