'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, LoaderCircle, RotateCcw } from 'lucide-react'
import type { Breakpoint, FunnelDocument, FunnelElement } from '@/lib/funnel'
import { getChildren, normalizeFunnelOptions } from '@/lib/funnel'
import {
  calculateFunnelScore,
  getFunnelFlowDefinition,
  getFlowEntryPageId,
  resolveFunnelDecision,
} from '@/lib/funnel/flow'
import { createClient } from '@/utils/supabase/client'
import { FunnelElementRenderer, isElementVisible, type FunnelValue, type RuntimeAction } from './element-renderer'
import { safeUrl } from './style-utils'

export interface FunnelRuntimeContext {
  sessionKey: string
  utms: Record<string, string>
  device: Breakpoint
}

export interface FunnelRuntimeEvent {
  type: 'view' | 'start' | 'page_view' | 'interaction' | 'complete' | 'validation_error'
  pageId?: string
  elementId?: string
  payload?: Record<string, unknown>
}

export interface FunnelSubmitResult {
  success: boolean
  redirectUrl?: string | null
  message?: string
}

interface FunnelPlayerProps {
  document: FunnelDocument
  publicationId?: string
  preview?: boolean
  forcedBreakpoint?: Breakpoint
  initialPageId?: string
  onStart?: (context: FunnelRuntimeContext) => Promise<void>
  onEvent?: (context: FunnelRuntimeContext, event: FunnelRuntimeEvent) => Promise<void>
  onProgress?: (
    context: FunnelRuntimeContext,
    pageId: string,
    pagePath: string[],
    values: Record<string, FunnelValue>,
  ) => Promise<void>
  onSubmit?: (
    context: FunnelRuntimeContext,
    pageId: string,
    pagePath: string[],
    values: Record<string, FunnelValue>,
  ) => Promise<FunnelSubmitResult>
}

const fieldTypes = new Set([
  'short_text', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio',
  'upload', 'quiz_choice', 'slider', 'rating',
])

const allowedUploadMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
])

function deviceBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  if (window.innerWidth < 640) return 'mobile'
  if (window.innerWidth < 1024) return 'tablet'
  return 'desktop'
}

function readUtms() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return Object.fromEntries(
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .map((key) => [key, params.get(key) || ''] as const)
      .filter(([, value]) => value),
  )
}

function sessionStorageKey(funnelId: string, publicationId?: string) {
  return `funnelflow:session:${funnelId}:${publicationId || 'preview'}`
}

function valuesStorageKey(funnelId: string, publicationId?: string) {
  return `funnelflow:values:${funnelId}:${publicationId || 'preview'}`
}

function pageStorageKey(funnelId: string, publicationId?: string) {
  return `funnelflow:page:${funnelId}:${publicationId || 'preview'}`
}

function historyStorageKey(funnelId: string, publicationId?: string) {
  return `funnelflow:history:${funnelId}:${publicationId || 'preview'}`
}

function resultStorageKey(funnelId: string, publicationId?: string) {
  return `funnelflow:result:${funnelId}:${publicationId || 'preview'}`
}

function storageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // The public experience must remain usable when storage is unavailable.
  }
}

function storageRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Storage can be blocked by privacy settings or browser policy.
  }
}

function parseStoredValues(rawValue: string | null): Record<string, FunnelValue> | null {
  if (!rawValue) return null
  try {
    const parsed: unknown = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const entries = Object.entries(parsed)
    if (entries.length > 200) return null
    for (const [key, value] of entries) {
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(key)) return null
      const valid = value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
        || (Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === 'string'))
      if (!valid) return null
    }
    return parsed as Record<string, FunnelValue>
  } catch {
    return null
  }
}

function parseStoredHistory(rawValue: string | null, validPageIds: Set<string>) {
  if (!rawValue) return null
  try {
    const parsed: unknown = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((id): id is string => typeof id === 'string' && validPageIds.has(id))
      .slice(-100)
  } catch {
    return null
  }
}

function getOrCreateSessionKey(funnelId: string, publicationId?: string) {
  const key = sessionStorageKey(funnelId, publicationId)
  const createdAtKey = `${key}:created-at`
  const existing = storageGet(key)
  const createdAt = Number(storageGet(createdAtKey) || 0)
  const stillActive = createdAt > 0 && Date.now() - createdAt < 23 * 60 * 60 * 1000
  if (existing && stillActive) return existing
  if (existing && !createdAt) {
    storageSet(createdAtKey, String(Date.now()))
    return existing
  }
  const created = crypto.randomUUID()
  storageRemove(valuesStorageKey(funnelId, publicationId))
  storageRemove(pageStorageKey(funnelId, publicationId))
  storageRemove(historyStorageKey(funnelId, publicationId))
  storageRemove(resultStorageKey(funnelId, publicationId))
  storageSet(key, created)
  storageSet(createdAtKey, String(Date.now()))
  return created
}

async function startRuntimeWithRetry(
  start: (context: FunnelRuntimeContext) => Promise<void>,
  context: FunnelRuntimeContext,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await start(context)
      return true
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)))
      }
    }
  }
  return false
}

function responseFieldPageMap(document: FunnelDocument) {
  return new Map(document.elements
    .filter((element) => fieldTypes.has(element.type))
    .map((element) => [
      typeof element.content.fieldKey === 'string' ? element.content.fieldKey : element.id,
      element.pageId,
    ]))
}

function valuesForPages(
  values: Record<string, FunnelValue>,
  fieldPages: Map<string, string>,
  pageIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => {
      const pageId = fieldPages.get(key)
      return pageId ? pageIds.has(pageId) : false
    }),
  ) as Record<string, FunnelValue>
}

function valuesWithPageDefaults(
  document: FunnelDocument,
  pageId: string | undefined,
  values: Record<string, FunnelValue>,
) {
  if (!pageId) return values
  const next = { ...values }
  for (const element of document.elements) {
    if (element.pageId !== pageId || element.type !== 'slider') continue
    const key = typeof element.content.fieldKey === 'string' ? element.content.fieldKey : element.id
    if (next[key] !== undefined) continue
    const minimum = Number(element.content.min ?? 0)
    next[key] = Number.isFinite(minimum) ? minimum : 0
  }
  return next
}

function variableContextForValues(
  document: FunnelDocument,
  values: Record<string, FunnelValue>,
  defaults: Record<string, unknown>,
  utms: Record<string, string> | undefined,
  score: number,
  resultKey: string | undefined,
  currentPageName: string | undefined,
) {
  const answerVariables = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [`answer.${key}`, value]),
  )
  const firstValueForType = (type: FunnelElement['type']) => {
    const field = document.elements.find((element) => element.type === type)
    const key = field && typeof field.content.fieldKey === 'string' ? field.content.fieldKey : ''
    return key ? values[key] : undefined
  }
  return {
    ...defaults,
    ...(utms || {}),
    ...values,
    ...answerVariables,
    score,
    'lead.score': score,
    'system.score': score,
    'system.result': resultKey || '',
    'lead.first_name': values.nome || values.name || values['lead.first_name'] || firstValueForType('short_text') || defaults['lead.first_name'],
    'lead.email': values.email || values['lead.email'] || firstValueForType('email') || defaults['lead.email'],
    'lead.phone': values.telefone || values.phone || values['lead.phone'] || firstValueForType('phone') || defaults['lead.phone'],
    'system.current_page': currentPageName || '',
  }
}

function visibleValuesForContext(
  document: FunnelDocument,
  values: Record<string, FunnelValue>,
  defaults: Record<string, unknown>,
  utms: Record<string, string> | undefined,
  score: number,
  resultKey: string | undefined,
) {
  const elementsById = new Map(document.elements.map((element) => [element.id, element]))
  const pageNames = new Map(document.pages.map((page) => [page.id, page.name]))
  const visibleValues: Record<string, FunnelValue> = {}
  for (const element of document.elements) {
    if (!fieldTypes.has(element.type)) continue
    const elementVariables = variableContextForValues(
      document,
      values,
      defaults,
      utms,
      score,
      resultKey,
      pageNames.get(element.pageId),
    )
    let cursor: FunnelElement | undefined = element
    const visited = new Set<string>()
    let visible = true
    while (cursor) {
      if (visited.has(cursor.id) || !isElementVisible(cursor, elementVariables)) {
        visible = false
        break
      }
      visited.add(cursor.id)
      cursor = cursor.parentId ? elementsById.get(cursor.parentId) : undefined
    }
    if (!visible) continue
    const key = typeof element.content.fieldKey === 'string' ? element.content.fieldKey : element.id
    if (values[key] !== undefined) visibleValues[key] = values[key]
  }
  return visibleValues
}

function resolveVisibleRuntimeState(
  document: FunnelDocument,
  activeValues: Record<string, FunnelValue>,
  defaults: Record<string, unknown>,
  utms: Record<string, string> | undefined,
  resultKey: string | undefined,
  currentPageName: string | undefined,
) {
  let values = activeValues
  let score = 0
  let variables = variableContextForValues(document, values, defaults, utms, score, resultKey, currentPageName)

  // The database calculates score against a score-dependent visibility fixed
  // point (10 attempts), then monotonically prunes hidden answers (up to 250
  // passes). Keep the browser on the same contract so preview, routing and the
  // authoritative submission cannot disagree.
  for (let pruningPass = 0; pruningPass < 250; pruningPass += 1) {
    let visibilityScore = 0
    let twoStepsAgo: number | undefined
    let scoreConverged = false

    for (let scorePass = 0; scorePass < 10; scorePass += 1) {
      variables = variableContextForValues(document, values, defaults, utms, visibilityScore, resultKey, currentPageName)
      const visibleElementAnswers = visibleValuesForContext(
        document,
        values,
        defaults,
        utms,
        visibilityScore,
        resultKey,
      )
      const nextScore = calculateFunnelScore(
        document,
        { answers: values, variables, utms },
        { elementAnswers: visibleElementAnswers },
      )
      if (nextScore === visibilityScore) {
        score = nextScore
        scoreConverged = true
        break
      }
      if (twoStepsAgo !== undefined && nextScore === twoStepsAgo) {
        return { values, score: nextScore, variables, converged: false }
      }
      twoStepsAgo = visibilityScore
      visibilityScore = nextScore
      score = nextScore
    }

    if (!scoreConverged) return { values, score, variables, converged: false }

    variables = variableContextForValues(document, values, defaults, utms, score, resultKey, currentPageName)
    const nextValues = visibleValuesForContext(document, values, defaults, utms, score, resultKey)
    if (JSON.stringify(nextValues) === JSON.stringify(values)) {
      return { values: nextValues, score, variables, converged: true }
    }
    values = nextValues
  }

  variables = variableContextForValues(document, values, defaults, utms, score, resultKey, currentPageName)
  return { values, score, variables, converged: false }
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, '')
}

function resultKeyForPath(
  document: FunnelDocument,
  pagePath: string[],
  values: Record<string, FunnelValue>,
  fieldPages: Map<string, string>,
  defaults: Record<string, unknown>,
  utms: Record<string, string> | undefined,
) {
  let resultKey: string | undefined
  const ranges = getFunnelFlowDefinition(document)?.resultRanges ?? []
  for (let index = 0; index < pagePath.length - 1; index += 1) {
    const sourcePageId = pagePath[index]
    const targetPageId = pagePath[index + 1]
    const prefixPageIds = new Set(pagePath.slice(0, index + 1))
    const prefixValues = valuesForPages(values, fieldPages, prefixPageIds)
    const prefixState = resolveVisibleRuntimeState(
      document,
      prefixValues,
      defaults,
      utms,
      resultKey,
      document.pages.find((page) => page.id === sourcePageId)?.name,
    )
    if (!prefixState.converged) return undefined
    const range = ranges.find((candidate) => (
      candidate.sourcePageId === sourcePageId
      && candidate.targetPageId === targetPageId
      && (candidate.minScore === undefined || prefixState.score >= candidate.minScore)
      && (candidate.maxScore === undefined || prefixState.score <= candidate.maxScore)
    ))
    if (range) resultKey = range.resultKey || range.label
  }
  return resultKey
}

export function FunnelPlayer({
  document,
  publicationId,
  preview = false,
  forcedBreakpoint,
  initialPageId,
  onStart,
  onEvent,
  onProgress,
  onSubmit,
}: FunnelPlayerProps) {
  const pages = useMemo(() => [...document.pages].sort((a, b) => a.order - b.order), [document.pages])
  const entryPageId = useMemo(() => getFlowEntryPageId(document), [document])
  const entryPageIndex = Math.max(0, pages.findIndex((page) => page.id === (initialPageId ?? entryPageId)))
  const [pageIndex, setPageIndex] = useState(entryPageIndex)
  const [pageHistory, setPageHistory] = useState<string[]>([])
  const [resultKey, setResultKey] = useState<string>()
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop')
  const [values, setValues] = useState<Record<string, FunnelValue>>(() => (
    valuesWithPageDefaults(document, pages[entryPageIndex]?.id, {})
  ))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [context, setContext] = useState<FunnelRuntimeContext | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const runtimeReadyRef = useRef<Promise<boolean>>(Promise.resolve(preview || !onStart))
  const interactionStartedRef = useRef(false)
  const interactionStartPromiseRef = useRef<Promise<void> | null>(null)
  const initialViewEmittedRef = useRef(false)
  const documentRef = useRef(document)

  useEffect(() => {
    documentRef.current = document
  }, [document])

  const currentPage = pages[pageIndex]
  const pageElements = useMemo(
    () => document.elements.filter((element) => element.pageId === currentPage?.id),
    [document.elements, currentPage?.id],
  )
  const fieldPages = useMemo(() => responseFieldPageMap(document), [document])
  const activePageIds = useMemo(
    () => new Set([...pageHistory, currentPage?.id].filter((id): id is string => Boolean(id))),
    [currentPage?.id, pageHistory],
  )
  const activeValues = useMemo(
    () => valuesForPages(values, fieldPages, activePageIds),
    [activePageIds, fieldPages, values],
  )

  const variableDefaults = useMemo<Record<string, unknown>>(
    () => Object.fromEntries(document.variables.map((variable) => [variable.key, variable.value ?? ''])),
    [document.variables],
  )
  const runtimeState = useMemo(() => resolveVisibleRuntimeState(
    document,
    activeValues,
    variableDefaults,
    context?.utms,
    resultKey,
    currentPage?.name,
  ), [activeValues, context?.utms, currentPage?.name, document, resultKey, variableDefaults])
  const effectiveValues = runtimeState.values
  const score = runtimeState.score
  const variables = runtimeState.variables

  const emit = useCallback(async (event: FunnelRuntimeEvent) => {
    if (!context || preview || !onEvent) return
    try {
      const ready = await runtimeReadyRef.current
      if (ready) await onEvent(context, event)
    } catch {
      // Analytics must never interrupt the public experience.
    }
  }, [context, onEvent, preview])

  const markStarted = useCallback(() => {
    if (interactionStartPromiseRef.current) return interactionStartPromiseRef.current
    if (!preview && (!context || !onEvent)) return Promise.resolve()
    interactionStartedRef.current = true
    window.dispatchEvent(new CustomEvent('funnelflow:start', {
      detail: { funnelId: document.funnelId },
    }))
    const pending = emit({ type: 'start', pageId: currentPage?.id })
    interactionStartPromiseRef.current = pending
    return pending
  }, [context, currentPage?.id, document.funnelId, emit, onEvent, preview])

  useEffect(() => {
    if (forcedBreakpoint) return
    const update = () => setBreakpoint(deviceBreakpoint())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [forcedBreakpoint])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const resolvedBreakpoint = forcedBreakpoint ?? deviceBreakpoint()
      const nextContext = preview
        ? { sessionKey: 'preview', utms: readUtms(), device: resolvedBreakpoint }
        : {
            sessionKey: getOrCreateSessionKey(document.funnelId, publicationId),
            utms: readUtms(),
            device: resolvedBreakpoint,
          }
      setContext(nextContext)
      interactionStartedRef.current = false
      interactionStartPromiseRef.current = null
      if (!preview) {
        const persistedPageId = storageGet(pageStorageKey(document.funnelId, publicationId))
        const persistedPageIndex = pages.findIndex((page) => page.id === persistedPageId)
        if (persistedPageIndex >= 0) setPageIndex(persistedPageIndex)

        const valuesKey = valuesStorageKey(document.funnelId, publicationId)
        const persistedValues = storageGet(valuesKey)
        const restoredValues = parseStoredValues(persistedValues)
        if (restoredValues) {
          const restoredPageId = persistedPageIndex >= 0 ? pages[persistedPageIndex].id : pages[entryPageIndex]?.id
          setValues(valuesWithPageDefaults(documentRef.current, restoredPageId, restoredValues))
        }
        else if (persistedValues) storageRemove(valuesKey)

        const historyKey = historyStorageKey(document.funnelId, publicationId)
        const persistedHistory = storageGet(historyKey)
        const restoredHistory = parseStoredHistory(
          persistedHistory,
          new Set(pages.map((page) => page.id)),
        )
        if (restoredHistory) setPageHistory(restoredHistory)
        else if (persistedHistory) storageRemove(historyKey)
        const persistedResult = storageGet(resultStorageKey(document.funnelId, publicationId))
        if (persistedResult && persistedResult.length <= 160) setResultKey(persistedResult)
        }
      runtimeReadyRef.current = !preview && onStart
        ? startRuntimeWithRetry(onStart, nextContext)
        : Promise.resolve(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [document.funnelId, entryPageIndex, forcedBreakpoint, onStart, pages, preview, publicationId])

  useEffect(() => {
    if (!context || preview) return
    storageSet(valuesStorageKey(document.funnelId, publicationId), JSON.stringify(values))
  }, [context, document.funnelId, preview, publicationId, values])

  useEffect(() => {
    if (!context || preview || !currentPage) return
    storageSet(pageStorageKey(document.funnelId, publicationId), currentPage.id)
    storageSet(historyStorageKey(document.funnelId, publicationId), JSON.stringify(pageHistory))
    if (resultKey) storageSet(resultStorageKey(document.funnelId, publicationId), resultKey)
    else storageRemove(resultStorageKey(document.funnelId, publicationId))
  }, [context, currentPage, document.funnelId, pageHistory, preview, publicationId, resultKey])

  useEffect(() => {
    if (!context || preview || !onProgress || !currentPage || Object.keys(effectiveValues).length === 0) return
    const timer = window.setTimeout(() => {
      void runtimeReadyRef.current
        .then((ready) => ready ? onProgress(context, currentPage.id, [...pageHistory, currentPage.id], effectiveValues) : undefined)
        .catch(() => undefined)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [context, currentPage, effectiveValues, onProgress, pageHistory, preview])

  useEffect(() => {
    if (!currentPage || !context) return
    const eventType = initialViewEmittedRef.current ? 'page_view' : 'view'
    initialViewEmittedRef.current = true
    void emit({ type: eventType, pageId: currentPage.id })
  }, [context, currentPage, emit])

  const updateValue = (key: string, value: FunnelValue) => {
    void markStarted()
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
    void emit({ type: 'interaction', pageId: currentPage?.id, payload: { fieldKey: key } })
  }

  const uploadFile = async (key: string, file: File) => {
    if (preview) {
      return file.name
    }
    if (!file.type || !allowedUploadMimeTypes.has(file.type.toLowerCase())) {
      throw new Error('Formato de arquivo não permitido. Use imagem, áudio, vídeo, PDF, Word, Excel, TXT ou CSV.')
    }
    if (!context) throw new Error('A sessão ainda está sendo iniciada.')
    if (!await runtimeReadyRef.current) throw new Error('Nao foi possivel iniciar esta experiencia.')
    const safeName = file.name.normalize('NFKD').replace(/[^A-Za-z0-9._-]/g, '-').slice(-120) || 'arquivo'
    const path = `${document.funnelId}/${context.sessionKey}/${crypto.randomUUID()}-${safeName}`
    const supabase = createClient()
    const { error } = await supabase.storage.from('funnel-uploads').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type.toLowerCase(),
      upsert: false,
    })
    if (error) throw new Error('Não foi possível enviar o arquivo. Confira o formato e tente novamente.')
    return path
  }

  const visibleFields = (elements: FunnelElement[]) => elements.filter((element) => fieldTypes.has(element.type))

  const isEffectivelyVisible = (element: FunnelElement) => {
    const ownerPageName = document.pages.find((page) => page.id === element.pageId)?.name
    const elementVariables = variableContextForValues(
      document,
      effectiveValues,
      variableDefaults,
      context?.utms,
      score,
      resultKey,
      ownerPageName,
    )
    let cursor: FunnelElement | undefined = element
    const visited = new Set<string>()
    while (cursor) {
      if (visited.has(cursor.id) || !isElementVisible(cursor, elementVariables)) return false
      visited.add(cursor.id)
      cursor = cursor.parentId ? document.elements.find((item) => item.id === cursor?.parentId) : undefined
    }
    return true
  }

  const validatePage = (allPages = false) => {
    const visitedPageIds = new Set([...pageHistory, currentPage?.id].filter(Boolean))
    const candidates = visibleFields(
      allPages
        ? document.elements.filter((element) => visitedPageIds.has(element.pageId))
        : pageElements,
    ).filter(isEffectivelyVisible)
    const nextErrors: Record<string, string> = {}

    for (const element of candidates) {
      const key = typeof element.content.fieldKey === 'string' ? element.content.fieldKey : element.id
      const value = effectiveValues[key]
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
      if (element.content.required && empty) nextErrors[key] = 'Este campo é obrigatório.'
      if (!empty && element.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) nextErrors[key] = 'Informe um e-mail válido.'
      if (!empty && element.type === 'phone' && normalizedPhone(String(value)).length < 10) nextErrors[key] = 'Informe um telefone válido.'
      if (!empty && ['number', 'slider', 'rating'].includes(element.type)) {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) nextErrors[key] = 'Informe um número válido.'
        if (element.content.min !== undefined && numericValue < Number(element.content.min)) nextErrors[key] = `O valor mínimo é ${element.content.min}.`
        if (element.content.max !== undefined && numericValue > Number(element.content.max)) nextErrors[key] = `O valor máximo é ${element.content.max}.`
      }
      if (!empty && element.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        nextErrors[key] = 'Informe uma data válida.'
      }
      if (!empty && ['select', 'radio', 'quiz_choice'].includes(element.type)) {
        const allowed = normalizeFunnelOptions(element.content.options).map((option) => option.value)
        if (!allowed.includes(String(value))) nextErrors[key] = 'Escolha uma das opções disponíveis.'
      }
      if (!empty && element.type === 'checkbox') {
        const allowed = new Set(normalizeFunnelOptions(element.content.options).map((option) => option.value))
        if (!Array.isArray(value) || value.some((item) => !allowed.has(String(item)))) {
          nextErrors[key] = 'Há uma opção inválida nesta resposta.'
        }
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      void emit({ type: 'validation_error', pageId: currentPage?.id, payload: { fields: Object.keys(nextErrors) } })
      if (allPages && currentPage) {
        const firstInvalidElement = candidates.find((element) => {
          const key = typeof element.content.fieldKey === 'string' ? element.content.fieldKey : element.id
          return Boolean(nextErrors[key])
        })
        if (firstInvalidElement && firstInvalidElement.pageId !== currentPage.id) {
          const targetIndex = pages.findIndex((page) => page.id === firstInvalidElement.pageId)
          const currentPath = [...pageHistory, currentPage.id]
          const pathIndex = currentPath.indexOf(firstInvalidElement.pageId)
          if (targetIndex >= 0) {
            setPageIndex(targetIndex)
            setPageHistory(pathIndex >= 0 ? currentPath.slice(0, pathIndex) : [])
            setSubmitMessage('Revise o campo destacado antes de concluir.')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }
      }
      window.requestAnimationFrame(() => window.document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return false
    }
    return true
  }

  const navigateTo = (index: number, remember = true) => {
    const targetIndex = Math.max(0, Math.min(index, pages.length - 1))
    if (remember && currentPage && pages[targetIndex]?.id !== currentPage.id) {
      setPageHistory((history) => [...history, currentPage.id].slice(-100))
    }
    setValues((current) => valuesWithPageDefaults(document, pages[targetIndex]?.id, current))
    setPageIndex(targetIndex)
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const navigateBack = () => {
    const previousPageId = pageHistory.at(-1)
    if (previousPageId) {
      const target = pages.findIndex((page) => page.id === previousPageId)
      const nextHistory = pageHistory.slice(0, -1)
      setPageHistory(nextHistory)
      setResultKey(resultKeyForPath(
        document,
        [...nextHistory, previousPageId],
        values,
        fieldPages,
        variableDefaults,
        context?.utms,
      ))
      if (target >= 0) navigateTo(target, false)
      return
    }
    setResultKey(undefined)
    navigateTo(pageIndex - 1, false)
  }

  const submit = async () => {
    if (!runtimeState.converged) {
      setSubmitMessage('As regras de pontuacao e visibilidade nao convergiram. Revise a configuracao deste funil.')
      return
    }
    if (!validatePage(true) || !context || submitting) return
    setSubmitting(true)
    try {
      await markStarted()
      if (!await runtimeReadyRef.current) throw new Error('Nao foi possivel iniciar esta experiencia. Recarregue a pagina e tente novamente.')
      const submissionValues: Record<string, FunnelValue> = {
        ...effectiveValues,
        ...(variables['lead.first_name'] !== undefined ? { 'lead.first_name': variables['lead.first_name'] as FunnelValue } : {}),
        ...(variables['lead.email'] !== undefined ? { 'lead.email': variables['lead.email'] as FunnelValue } : {}),
        ...(variables['lead.phone'] !== undefined ? { 'lead.phone': variables['lead.phone'] as FunnelValue } : {}),
        'system.score': score,
        ...(resultKey ? { 'system.result': resultKey } : {}),
      }
      const result = onSubmit
        ? await onSubmit(context, currentPage.id, [...pageHistory, currentPage.id], submissionValues)
        : { success: true }
      if (!result.success) throw new Error(result.message || 'Não foi possível enviar suas respostas.')
      void emit({ type: 'complete', pageId: currentPage?.id, payload: { score, resultKey } })
      window.dispatchEvent(new CustomEvent('funnelflow:complete', {
        detail: { funnelId: document.funnelId },
      }))
      if (result.redirectUrl) {
        const destination = safeUrl(result.redirectUrl)
        if (destination) window.location.assign(destination)
      }
      setSubmitMessage(result.message || 'Suas respostas foram enviadas com sucesso.')
      setCompleted(true)
      if (!preview) {
        const sessionKey = sessionStorageKey(document.funnelId, publicationId)
        storageRemove(valuesStorageKey(document.funnelId, publicationId))
        storageRemove(pageStorageKey(document.funnelId, publicationId))
        storageRemove(historyStorageKey(document.funnelId, publicationId))
        storageRemove(resultStorageKey(document.funnelId, publicationId))
        storageRemove(sessionKey)
        storageRemove(`${sessionKey}:created-at`)
      }
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : 'Não foi possível enviar. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAction = (action: RuntimeAction) => {
    void markStarted()
    switch (action.type) {
      case 'next_page':
        if (!runtimeState.converged) {
          setSubmitMessage('As regras de pontuacao e visibilidade nao convergiram. Revise a configuracao deste funil.')
          return
        }
        if (!validatePage()) return
        {
          const decision = resolveFunnelDecision(document, currentPage.id, {
            answers: effectiveValues,
            variables,
            utms: context?.utms,
            score,
          })
          if (decision.resultKey) setResultKey(decision.resultKey)
          if (!decision.targetPageId) {
            void submit()
            break
          }
          const target = pages.findIndex((page) => page.id === decision.targetPageId)
          if (target >= 0) {
            const retainedPages = new Set([...activePageIds, decision.targetPageId])
            setValues((current) => valuesForPages(current, fieldPages, retainedPages))
            navigateTo(target)
          }
          else setSubmitMessage('O fluxo aponta para uma página que não existe.')
        }
        break
      case 'previous_page':
        navigateBack()
        break
      case 'go_to_page': {
        if (!runtimeState.converged) {
          setSubmitMessage('As regras de pontuacao e visibilidade nao convergiram. Revise a configuracao deste funil.')
          return
        }
        if (!validatePage()) return
        const target = pages.findIndex((page) => page.id === action.target || page.slug === action.target)
        if (target >= 0) {
          const retainedPages = new Set([...activePageIds, pages[target].id])
          setValues((current) => valuesForPages(current, fieldPages, retainedPages))
          navigateTo(target)
        }
        break
      }
      case 'submit':
        void submit()
        break
      case 'open_url': {
        const destination = safeUrl(action.target)
        if (destination) window.open(destination, '_blank', 'noopener,noreferrer')
        break
      }
    }
  }

  const renderBranch = (parentId: string | null) =>
    getChildren(pageElements, currentPage.id, parentId).map((element) => (
      <FunnelElementRenderer
        key={element.id}
        element={element}
        breakpoint={forcedBreakpoint ?? breakpoint}
        values={effectiveValues}
        variables={variables}
        errors={errors}
        onValue={updateValue}
        onUpload={uploadFile}
        onAction={handleAction}
      >
        {renderBranch(element.id)}
      </FunnelElementRenderer>
    ))

  if (!currentPage) {
    return <div className="flex min-h-screen items-center justify-center bg-[#07080d] text-sm text-zinc-500">Este funil ainda não possui páginas.</div>
  }

  if (completed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07080d] px-5 text-zinc-100">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[.035] p-8 text-center shadow-2xl">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/12"><CheckCircle2 className="size-7 text-emerald-400" /></span>
          <h1 className="mt-6 text-2xl font-extrabold">Tudo certo!</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{submitMessage}</p>
        </div>
      </main>
    )
  }

  return (
    <main
      className="relative min-h-screen overflow-x-hidden text-zinc-100"
      style={{
        backgroundColor: document.settings.backgroundColor || '#050507',
        fontFamily: document.settings.fontFamily ? `${document.settings.fontFamily}, sans-serif` : undefined,
      }}
    >
      <div className="fixed left-0 top-0 z-50 h-1 bg-violet-500 transition-all duration-500" style={{ width: `${Math.min(100, (new Set([...pageHistory, currentPage.id]).size / pages.length) * 100)}%` }} />
      {renderBranch(null)}

      {pageHistory.length > 0 && (
        <button type="button" onClick={navigateBack} className="fixed bottom-5 left-5 z-40 inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/65 backdrop-blur-xl transition hover:text-white" aria-label="Voltar para a página anterior">
          <ChevronLeft className="size-4" />
        </button>
      )}

      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm" role="status">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111219] px-5 py-4 text-sm font-semibold"><LoaderCircle className="size-5 animate-spin text-violet-400" />Enviando respostas...</div>
        </div>
      )}

      {submitMessage && !completed && (
        <div role="alert" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-xl">
          {submitMessage}
          <button type="button" onClick={() => setSubmitMessage('')} aria-label="Fechar aviso"><RotateCcw className="size-4" /></button>
        </div>
      )}
    </main>
  )
}
