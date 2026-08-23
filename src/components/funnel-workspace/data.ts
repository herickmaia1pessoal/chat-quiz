import 'server-only'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type {
  FunnelAnalyticsData,
  FunnelSubmissionRecord,
  FunnelSubmissionValueRecord,
  FunnelWorkspaceMeta,
} from './types'

const MAX_SUBMISSIONS = 500
const MAX_ANALYTICS_SESSIONS = 10_000
const MAX_ANALYTICS_EVENTS = 20_000

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

interface FunnelRow {
  id: string
  name: string
  slug: string
  status: FunnelWorkspaceMeta['status']
  draft_revision: number | string
  published_revision: number | string | null
}

interface SubmissionRow {
  id: string
  session_id: string
  name: string | null
  email: string | null
  phone: string | null
  lead: Record<string, unknown> | null
  score: number | string | null
  result_key: string | null
  tags: string[] | null
  submitted_at: string
}

interface SubmissionValueRow {
  id: number | string
  submission_id: string
  field_key: string
  value: unknown
  created_at: string
}

interface SessionRow {
  id: string
  status: 'active' | 'completed' | 'abandoned' | 'expired'
  current_page_id: string | null
  last_seen_at: string
  utm: Record<string, unknown> | null
  device: Record<string, unknown> | null
}

interface EventRow {
  session_id: string
  event_type: string
  page_id: string | null
  occurred_at: string
}

interface InteractionEventRow {
  session_id: string
  page_id: string | null
  element_id: string | null
  occurred_at: string
}

interface PageRow {
  id: string
  name: string
  order_num: number
}

interface ElementFieldRow {
  id: string
  page_id: string
  type: string
  content: Record<string, unknown> | null
}

function asFiniteNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toMeta(row: FunnelRow, publishedSlug: string | null): FunnelWorkspaceMeta {
  const publishedRevision = row.published_revision === null ? null : Number(row.published_revision)
  const effectiveStatus = row.status === 'published' && publishedSlug
    ? 'published'
    : row.status === 'archived'
      ? 'archived'
      : 'draft'

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    publishedSlug,
    status: effectiveStatus,
    draftRevision: Number(row.draft_revision),
    publishedRevision,
  }
}

export async function requireFunnelWorkspace(funnelId: string): Promise<{
  supabase: ServerSupabaseClient
  funnel: FunnelWorkspaceMeta
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const [{ data, error }, { data: publication, error: publicationError }] = await Promise.all([
    supabase
      .from('funnels')
      .select('id, name, slug, status, draft_revision, published_revision')
      .eq('id', funnelId)
      .maybeSingle(),
    supabase
      .from('funnel_publications')
      .select('slug')
      .eq('funnel_id', funnelId)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (error) throw new Error(`Não foi possível carregar o funil: ${error.message}`)
  if (publicationError) throw new Error(`Falha ao carregar a publicacao ativa: ${publicationError.message}`)
  if (!data) notFound()

  return { supabase, funnel: toMeta(data as FunnelRow, publication?.slug ?? null) }
}

export async function getFunnelSubmissions(funnelId: string): Promise<{
  funnel: FunnelWorkspaceMeta
  submissions: FunnelSubmissionRecord[]
  truncated: boolean
}> {
  const { supabase, funnel } = await requireFunnelWorkspace(funnelId)
  const { data, error, count } = await supabase
    .from('funnel_submissions')
    .select('id, session_id, name, email, phone, lead, score, result_key, tags, submitted_at', {
      count: 'exact',
    })
    .eq('funnel_id', funnelId)
    .order('submitted_at', { ascending: false })
    .limit(MAX_SUBMISSIONS)

  if (error) throw new Error(`Não foi possível carregar os leads: ${error.message}`)

  const rows = (data ?? []) as SubmissionRow[]
  const ids = rows.map((row) => row.id)
  let valueRows: SubmissionValueRow[] = []

  if (ids.length > 0) {
    const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => (
      ids.slice(index * 100, index * 100 + 100)
    ))
    const valueResults = await Promise.all(chunks.map((chunk) => supabase
      .from('funnel_submission_values')
      .select('id, submission_id, field_key, value, created_at')
      .eq('funnel_id', funnelId)
      .in('submission_id', chunk)
      .order('created_at', { ascending: true })))
    const valuesError = valueResults.find((result) => result.error)?.error
    if (valuesError) {
      throw new Error(`Não foi possível carregar as respostas: ${valuesError.message}`)
    }
    valueRows = valueResults.flatMap((result) => (result.data ?? []) as SubmissionValueRow[])
  }

  const valuesBySubmission = new Map<string, FunnelSubmissionValueRecord[]>()
  for (const value of valueRows) {
    const record: FunnelSubmissionValueRecord = {
      id: Number(value.id),
      submissionId: value.submission_id,
      fieldKey: value.field_key,
      value: value.value,
      createdAt: value.created_at,
    }
    const current = valuesBySubmission.get(record.submissionId) ?? []
    current.push(record)
    valuesBySubmission.set(record.submissionId, current)
  }

  return {
    funnel,
    truncated: (count ?? rows.length) > rows.length,
    submissions: rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      lead: row.lead ?? {},
      score: asFiniteNumber(row.score),
      resultKey: row.result_key,
      tags: row.tags ?? [],
      submittedAt: row.submitted_at,
      values: valuesBySubmission.get(row.id) ?? [],
    })),
  }
}

function startOfLocalDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function localDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function getFunnelAnalytics(funnelId: string): Promise<{
  funnel: FunnelWorkspaceMeta
  analytics: FunnelAnalyticsData
}> {
  const { supabase, funnel } = await requireFunnelWorkspace(funnelId)

  const [
    pagesResult,
    elementsResult,
    sessionsResult,
    submissionsResult,
    visitsResult,
    startsResult,
    pageEventsResult,
    interactionEventsResult,
  ] = await Promise.all([
    supabase
      .from('funnel_pages')
      .select('id, name, order_num')
      .eq('funnel_id', funnelId)
      .order('order_num', { ascending: true }),
    supabase
      .from('funnel_elements')
      .select('id, page_id, type, content')
      .eq('funnel_id', funnelId)
      .in('type', ['short_text', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio', 'upload', 'quiz_choice', 'slider', 'rating']),
    supabase
      .from('funnel_sessions')
      .select('id, status, current_page_id, last_seen_at, utm, device', { count: 'exact' })
      .eq('funnel_id', funnelId)
      .order('last_seen_at', { ascending: false })
      .limit(MAX_ANALYTICS_SESSIONS),
    supabase
      .from('funnel_submissions')
      .select('id, submitted_at', { count: 'exact' })
      .eq('funnel_id', funnelId)
      .order('submitted_at', { ascending: false })
      .limit(MAX_ANALYTICS_SESSIONS),
    supabase
      .from('funnel_events')
      .select('*', { count: 'exact', head: true })
      .eq('funnel_id', funnelId)
      .eq('event_type', 'view'),
    supabase
      .from('funnel_events')
      .select('session_id, event_type, page_id, occurred_at', { count: 'exact' })
      .eq('funnel_id', funnelId)
      .eq('event_type', 'start')
      .order('occurred_at', { ascending: false })
      .limit(MAX_ANALYTICS_EVENTS),
    supabase
      .from('funnel_events')
      .select('session_id, event_type, page_id, occurred_at', { count: 'exact' })
      .eq('funnel_id', funnelId)
      .in('event_type', ['view', 'page_view'])
      .order('occurred_at', { ascending: false })
      .limit(MAX_ANALYTICS_EVENTS),
    supabase
      .from('funnel_events')
      .select('session_id, page_id, element_id, occurred_at', { count: 'exact' })
      .eq('funnel_id', funnelId)
      .eq('event_type', 'interaction')
      .not('element_id', 'is', null)
      .order('occurred_at', { ascending: true })
      .limit(MAX_ANALYTICS_EVENTS),
  ])

  const firstError = [
    pagesResult.error,
    elementsResult.error,
    sessionsResult.error,
    submissionsResult.error,
    visitsResult.error,
    startsResult.error,
    pageEventsResult.error,
    interactionEventsResult.error,
  ].find(Boolean)
  if (firstError) throw new Error(`Não foi possível calcular os indicadores: ${firstError.message}`)

  const pages = (pagesResult.data ?? []) as PageRow[]
  const elements = (elementsResult.data ?? []) as ElementFieldRow[]
  const sessions = (sessionsResult.data ?? []) as SessionRow[]
  const submissions = (submissionsResult.data ?? []) as Array<{ id: string; submitted_at: string }>
  const startEvents = (startsResult.data ?? []) as EventRow[]
  const pageEvents = (pageEventsResult.data ?? []) as EventRow[]
  const interactionEvents = (interactionEventsResult.data ?? []) as InteractionEventRow[]
  const sessionCount = sessionsResult.count ?? sessions.length
  const startCount = startsResult.count ?? startEvents.length
  const completionCount = submissionsResult.count ?? submissions.length
  const startedSessionIds = new Set(startEvents.map((event) => event.session_id))
  const now = Date.now()
  const staleAfterMs = 30 * 60 * 1000
  const abandonedSessions = sessions.filter((session) => {
    // A page load creates a resumable session, but it is not an actual start.
    // Only sessions with the explicit first-interaction event enter abandonment.
    if (!startedSessionIds.has(session.id)) return false
    if (session.status === 'completed') return false
    if (session.status === 'abandoned' || session.status === 'expired') return true
    return now - new Date(session.last_seen_at).getTime() >= staleAfterMs
  })

  const pageVisits = new Map<string, Set<string>>()
  for (const event of pageEvents) {
    if (!event.page_id) continue
    const visitors = pageVisits.get(event.page_id) ?? new Set<string>()
    visitors.add(event.session_id)
    pageVisits.set(event.page_id, visitors)
  }

  const pageAbandonments = new Map<string, number>()
  for (const session of abandonedSessions) {
    if (!session.current_page_id) continue
    pageAbandonments.set(
      session.current_page_id,
      (pageAbandonments.get(session.current_page_id) ?? 0) + 1,
    )
  }

  // Per-element interaction counts (engagement) and the last element each
  // abandoned session touched on its final page (a proxy for exactly which
  // field the visitor stalled on, not just which page).
  const elementInteractionCounts = new Map<string, number>()
  const lastInteractedElementBySession = new Map<string, string>()
  for (const event of interactionEvents) {
    if (!event.element_id) continue
    elementInteractionCounts.set(event.element_id, (elementInteractionCounts.get(event.element_id) ?? 0) + 1)
    // Events are ordered ascending by occurred_at, so the last write wins.
    lastInteractedElementBySession.set(event.session_id, event.element_id)
  }
  const elementAbandonments = new Map<string, number>()
  for (const session of abandonedSessions) {
    const lastElementId = lastInteractedElementBySession.get(session.id)
    if (!lastElementId) continue
    elementAbandonments.set(lastElementId, (elementAbandonments.get(lastElementId) ?? 0) + 1)
  }

  const elementsByPage = new Map<string, ElementFieldRow[]>()
  for (const element of elements) {
    const list = elementsByPage.get(element.page_id) ?? []
    list.push(element)
    elementsByPage.set(element.page_id, list)
  }
  const elementLabel = (element: ElementFieldRow) => {
    const content = element.content ?? {}
    const label = typeof content.label === 'string' ? content.label.trim() : ''
    return label || (typeof content.fieldKey === 'string' ? content.fieldKey : element.id)
  }

  // UTM source and device breakdowns, joined against the same start events
  // used for the headline conversion rate. A session's completion is read
  // straight off its status (set to 'completed' by submit_funnel_impl),
  // consistent with how abandonment above already reads session.status.
  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  function breakdownBy(keyOf: (session: SessionRow) => string): FunnelAnalyticsData['utmSources'] {
    const startsByKey = new Map<string, Set<string>>()
    for (const event of startEvents) {
      const session = sessionById.get(event.session_id)
      if (!session) continue
      const key = keyOf(session)
      const set = startsByKey.get(key) ?? new Set<string>()
      set.add(event.session_id)
      startsByKey.set(key, set)
    }
    const completionsByKey = new Map<string, number>()
    for (const [key, sessionIds] of startsByKey) {
      let completed = 0
      for (const sessionId of sessionIds) {
        const session = sessionById.get(sessionId)
        if (session?.status === 'completed') completed += 1
      }
      completionsByKey.set(key, completed)
    }
    return Array.from(startsByKey.entries())
      .map(([key, sessionIds]) => {
        const starts = sessionIds.size
        const completions = completionsByKey.get(key) ?? 0
        return { key, starts, completions, conversionRate: starts > 0 ? (completions / starts) * 100 : 0 }
      })
      .sort((left, right) => right.starts - left.starts)
      .slice(0, 20)
  }

  const utmSources = breakdownBy((session) => {
    const source = session.utm && typeof session.utm.utm_source === 'string' ? session.utm.utm_source.trim() : ''
    return source || 'Direto / sem UTM'
  })
  const devices = breakdownBy((session) => {
    const breakpoint = session.device && typeof session.device.breakpoint === 'string' ? session.device.breakpoint.trim() : ''
    return breakpoint === 'desktop' ? 'Desktop' : breakpoint === 'tablet' ? 'Tablet' : breakpoint === 'mobile' ? 'Celular' : 'Não identificado'
  })

  const dailyMap = new Map<string, { starts: number; completions: number }>()
  const today = startOfLocalDay(new Date())
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    dailyMap.set(localDayKey(date), { starts: 0, completions: 0 })
  }
  for (const event of startEvents) {
    const entry = dailyMap.get(localDayKey(new Date(event.occurred_at)))
    if (entry) entry.starts += 1
  }
  for (const submission of submissions) {
    const entry = dailyMap.get(localDayKey(new Date(submission.submitted_at)))
    if (entry) entry.completions += 1
  }

  const daily = Array.from(dailyMap.entries()).map(([date, value]) => ({
    date,
    label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
      new Date(`${date}T12:00:00`),
    ),
    ...value,
  }))

  return {
    funnel,
    analytics: {
      visits: visitsResult.count ?? 0,
      starts: startCount,
      completions: completionCount,
      conversionRate: startCount > 0 ? (completionCount / startCount) * 100 : 0,
      abandonments: abandonedSessions.length,
      pageAnalytics: pages.map((page) => {
        const visits = pageVisits.get(page.id)?.size ?? 0
        const abandonments = pageAbandonments.get(page.id) ?? 0
        const pageElements = elementsByPage.get(page.id) ?? []
        return {
          id: page.id,
          name: page.name,
          order: page.order_num,
          visits,
          abandonments,
          abandonmentRate: visits > 0 ? (abandonments / visits) * 100 : 0,
          elementAnalytics: pageElements
            .map((element) => ({
              id: element.id,
              fieldKey: typeof element.content?.fieldKey === 'string' ? element.content.fieldKey : element.id,
              label: elementLabel(element),
              interactions: elementInteractionCounts.get(element.id) ?? 0,
              abandonments: elementAbandonments.get(element.id) ?? 0,
            }))
            .filter((item) => item.interactions > 0 || item.abandonments > 0)
            .sort((left, right) => right.abandonments - left.abandonments || right.interactions - left.interactions),
        }
      }),
      utmSources,
      devices,
      daily,
      sampled:
        sessionCount > sessions.length ||
        completionCount > submissions.length ||
        startCount > startEvents.length ||
        (pageEventsResult.count ?? pageEvents.length) > pageEvents.length ||
        (interactionEventsResult.count ?? interactionEvents.length) > interactionEvents.length,
    },
  }
}
