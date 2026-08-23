'use server'

import type { FunnelRuntimeContext, FunnelRuntimeEvent } from '@/components/funnel-runtime/funnel-player'
import type { FunnelValue } from '@/components/funnel-runtime/element-renderer'
import { isSupportedFunnelUtmKey } from '@/lib/funnel/keys'
import { createClient } from '@/utils/supabase/server'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_EVENTS = new Set(['view', 'start', 'page_view', 'interaction', 'complete', 'validation_error'])

function assertPublicContext(slug: string, context: FunnelRuntimeContext) {
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) throw new Error('Funil inválido.')
  if (!UUID_PATTERN.test(context.sessionKey)) throw new Error('Sessão inválida.')
  if (!['desktop', 'tablet', 'mobile'].includes(context.device)) throw new Error('Dispositivo inválido.')

  const utms = Object.fromEntries(
    Object.entries(context.utms)
      .filter(([key, value]) => isSupportedFunnelUtmKey(key) && typeof value === 'string')
      .map(([key, value]) => [key, value.slice(0, 500)]),
  )

  return { sessionKey: context.sessionKey, device: context.device, utms }
}

function cleanValues(values: Record<string, FunnelValue>) {
  const entries = Object.entries(values)
  if (entries.length > 200) throw new Error('O envio possui campos demais.')

  const cleaned = Object.fromEntries(entries.map(([key, value]) => {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(key)) throw new Error('Uma chave de resposta é inválida.')
    if (Array.isArray(value)) return [key, value.slice(0, 100).map((item) => String(item).slice(0, 500))]
    if (typeof value === 'string') return [key, value.slice(0, 5000)]
    if (typeof value === 'number' && !Number.isFinite(value)) return [key, null]
    return [key, value]
  }))

  if (JSON.stringify(cleaned).length > 256_000) throw new Error('O envio ultrapassa o tamanho permitido.')
  return cleaned
}

function cleanPagePath(pageId: string, pagePath: string[]) {
  if (!Array.isArray(pagePath) || pagePath.length < 1 || pagePath.length > 200) {
    throw new Error('Percurso do funil invalido.')
  }
  if (pagePath.some((candidate) => typeof candidate !== 'string' || !UUID_PATTERN.test(candidate))) {
    throw new Error('Percurso do funil invalido.')
  }
  if (pagePath.at(-1) !== pageId) throw new Error('A pagina atual nao corresponde ao percurso.')
  return pagePath
}

function stringValue(values: Record<string, FunnelValue>, keys: string[]) {
  for (const key of keys) {
    const value = values[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500)
  }
  return null
}

export async function startFunnelRuntime(
  slug: string,
  publicationId: string,
  versionId: string,
  rawContext: FunnelRuntimeContext,
) {
  const context = assertPublicContext(slug, rawContext)
  if (!UUID_PATTERN.test(publicationId) || !UUID_PATTERN.test(versionId)) {
    throw new Error('Publicação inválida.')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('start_funnel_session', {
    p_slug: slug,
    p_publication_id: publicationId,
    p_version_id: versionId,
    p_session_key: context.sessionKey,
    p_utm: context.utms,
    p_device: { breakpoint: context.device },
  })
  if (error) throw new Error('Não foi possível iniciar esta experiência.')
}

export async function trackFunnelRuntimeEvent(
  slug: string,
  rawContext: FunnelRuntimeContext,
  event: FunnelRuntimeEvent,
) {
  const context = assertPublicContext(slug, rawContext)
  if (!ALLOWED_EVENTS.has(event.type)) return

  const payload = event.payload && JSON.stringify(event.payload).length <= 8_000 ? event.payload : {}
  const firstInteraction = event.type === 'start'
  const discriminator = firstInteraction
    ? 'first-interaction'
    : event.elementId || String(event.payload?.fieldKey || 'event')
  const eventKey = [
    context.sessionKey,
    event.type,
    firstInteraction ? 'funnel' : event.pageId || 'none',
    discriminator,
  ].join(':').slice(0, 160)
  const supabase = await createClient()
  const { error } = await supabase.rpc('track_funnel_event', {
    p_session_key: context.sessionKey,
    p_event_key: eventKey,
    p_event_type: event.type,
    p_page_id: event.pageId || null,
    p_element_id: event.elementId || null,
    p_payload: payload,
  })
  if (error) throw new Error('Não foi possível registrar o evento.')
}

export async function saveFunnelRuntimeProgress(
  slug: string,
  rawContext: FunnelRuntimeContext,
  pageId: string,
  rawPagePath: string[],
  rawValues: Record<string, FunnelValue>,
) {
  const context = assertPublicContext(slug, rawContext)
  const pagePath = cleanPagePath(pageId, rawPagePath)
  if (!UUID_PATTERN.test(pageId)) throw new Error('Página inválida.')
  const values = cleanValues(rawValues)
  const lead = {
    name: stringValue(values, ['lead.first_name', 'nome', 'name']),
    email: stringValue(values, ['lead.email', 'email'])?.toLowerCase() || null,
    phone: stringValue(values, ['lead.phone', 'telefone', 'phone'])?.replace(/\D/g, '') || null,
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_funnel_progress', {
    p_session_key: context.sessionKey,
    p_page_id: pageId,
    p_page_path: pagePath,
    p_values: values,
    p_lead: lead,
  })
  if (error) throw new Error('Não foi possível salvar o progresso.')
}

export async function submitFunnelRuntime(
  slug: string,
  rawContext: FunnelRuntimeContext,
  pageId: string,
  rawPagePath: string[],
  rawValues: Record<string, FunnelValue>,
) {
  const context = assertPublicContext(slug, rawContext)
  const pagePath = cleanPagePath(pageId, rawPagePath)
  if (!UUID_PATTERN.test(pageId)) throw new Error('Página inválida.')
  const values = cleanValues(rawValues)
  const scoreValue = values['system.score']
  const resultValue = values['system.result']
  const score = typeof scoreValue === 'number'
    ? scoreValue
    : typeof scoreValue === 'string' && /^-?\d+(?:\.\d+)?$/.test(scoreValue)
      ? Number(scoreValue)
      : null
  const resultKey = typeof resultValue === 'string' && resultValue.trim()
    ? resultValue.trim().slice(0, 160)
    : null
  const lead = {
    name: stringValue(values, ['lead.first_name', 'nome', 'name']),
    email: stringValue(values, ['lead.email', 'email'])?.toLowerCase() || null,
    phone: stringValue(values, ['lead.phone', 'telefone', 'phone'])?.replace(/\D/g, '') || null,
    score: Number.isFinite(score) ? score : null,
    resultKey,
    ...context.utms,
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_funnel', {
    p_session_key: context.sessionKey,
    p_page_id: pageId,
    p_page_path: pagePath,
    p_values: values,
    p_lead: lead,
  })
  if (error) throw new Error('Não foi possível enviar suas respostas. Tente novamente.')

  return { success: true, message: 'Suas respostas foram enviadas com sucesso.' }
}
