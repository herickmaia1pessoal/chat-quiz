'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type {
  FunnelDocument,
  PublishFunnelInput,
  PublishFunnelResult,
  SaveDraftInput,
  SaveDraftResult,
} from '@/lib/funnel/types'
import { ELEMENT_REGISTRY } from '@/lib/funnel/registry'
import { validateFunnelFlow } from '@/lib/funnel/flow'
import {
  funnelKeyIdentity,
  isSupportedFunnelUtmKey,
  isValidCustomVariableKey,
  isValidResponseFieldKey,
} from '@/lib/funnel/keys'
import { createClient } from '@/utils/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_DOCUMENT_BYTES = 900_000
const MAX_IMPORT_BYTES = 960_000
const RESPONSE_ELEMENT_TYPES = new Set([
  'short_text', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio',
  'upload', 'quiz_choice', 'slider', 'rating',
])

type JsonObject = Record<string, unknown>

export interface FunnelExportV2 {
  format: 'funnelflow.funnel'
  formatVersion: 2
  exportedAt: string
  source: {
    funnelId: string
    workspaceId: string
    name: string
    description: string | null
    revision: number
    publishedVersionId: string | null
  }
  document: FunnelDocument
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

interface DraftMutationResult {
  funnelId: string
  revision: number
  versionId: string
  savedAt: string
}

interface PublicationResult {
  funnelId: string
  revision: number
  versionId: string
  publicationId: string
  slug: string
  publishedAt: string
}

interface CreateFunnelRpcRow {
  funnel_id: string
  revision: number | string
  slug: string
}

interface SaveDraftRpcRow {
  funnel_id: string
  revision: number | string
  version_id: string
  saved_at: string
}

interface PublishFunnelRpcRow {
  funnel_id: string
  revision: number | string
  version_id: string
  publication_id: string
  slug: string
  published_at: string
}

interface RestoreVersionRpcRow extends SaveDraftRpcRow {
  restored_from_version_id: string
}

class FunnelRevisionConflictError extends Error {
  constructor() {
    super('Este funil foi alterado em outra aba. Recarregue a versão mais recente antes de continuar.')
    this.name = 'FunnelRevisionConflictError'
  }
}

function requiredString(value: FormDataEntryValue | null, field: string, maxLength: number) {
  if (typeof value !== 'string') throw new Error(`${field} inválido.`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} deve ter entre 1 e ${maxLength} caracteres.`)
  }
  return normalized
}

function optionalString(value: FormDataEntryValue | null, maxLength: number) {
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('Valor inválido.')
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) throw new Error(`O valor excede ${maxLength} caracteres.`)
  return normalized
}

function assertUuid(value: string, field = 'Identificador') {
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} inválido.`)
}

function assertRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Revisão do funil inválida.')
  }
}

function isSafeExternalScriptUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && hostname.includes('.')
      && !/^(?:localhost|\d+(?:\.\d+){3}|\[[0-9a-f:]+\])$/i.test(hostname)
      && !/(?:^|\.)(?:local|internal|localhost|home\.arpa)$/i.test(hostname)
  } catch {
    return false
  }
}

function assertDocument(funnelId: string, document: FunnelDocument) {
  if (!document || typeof document !== 'object' || document.schemaVersion !== 2) {
    throw new Error('Documento do funil inválido ou incompatível.')
  }
  if (document.funnelId !== funnelId) {
    throw new Error('O documento não pertence ao funil informado.')
  }
  if (!Array.isArray(document.pages) || !Array.isArray(document.elements) || !Array.isArray(document.variables)) {
    throw new Error('Estrutura do documento do funil inválida.')
  }

  const settings = document.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Configuracoes do funil invalidas.')
  }
  for (const key of ['socialImage', 'faviconUrl'] as const) {
    const value = settings[key]
    if (value !== undefined && value !== '' && (
      typeof value !== 'string'
      || value.length > 2048
      || !/^https:\/\/\S+$/i.test(value)
    )) throw new Error(`${key} deve ser uma URL HTTPS valida.`)
  }
  if (settings.metaPixelId !== undefined && settings.metaPixelId !== '' && (
    typeof settings.metaPixelId !== 'string' || !/^\d{5,20}$/.test(settings.metaPixelId)
  )) throw new Error('Meta Pixel ID invalido.')
  if (settings.googleTagId !== undefined && settings.googleTagId !== '' && (
    typeof settings.googleTagId !== 'string'
    || !/^(?:G|GT|GTM|AW)-[A-Z0-9]{4,20}$/i.test(settings.googleTagId)
  )) throw new Error('Google Tag ID invalido.')
  if (settings.noIndex !== undefined && typeof settings.noIndex !== 'boolean') {
    throw new Error('Configuracao de indexacao invalida.')
  }
  if (settings.customScriptUrls !== undefined && (
    !Array.isArray(settings.customScriptUrls)
    || settings.customScriptUrls.length > 5
    || settings.customScriptUrls.some((value) => (
      typeof value !== 'string'
      || value.length > 2048
      || !isSafeExternalScriptUrl(value)
    ))
  )) throw new Error('Scripts personalizados devem usar URLs HTTPS externas validas (maximo de 5).')

  const pageIds = new Set(document.pages.map((page) => page.id))
  if (pageIds.size !== document.pages.length) throw new Error('Existem paginas duplicadas no documento.')
  const elementById = new Map(document.elements.map((element) => [element.id, element]))
  if (elementById.size !== document.elements.length) throw new Error('Existem elementos duplicados no documento.')
  const responseKeys = new Set<string>()
  const responseKeyIdentities = new Set<string>()
  for (const element of document.elements) {
    const parent = element.parentId ? elementById.get(element.parentId) : null
    const allowedParents = ELEMENT_REGISTRY[element.type]?.allowedParents
    if (!pageIds.has(element.pageId)
        || (element.parentId && !parent)
        || (parent && parent.pageId !== element.pageId)
        || !allowedParents || (parent
      ? !allowedParents.includes(parent.type)
      : allowedParents.length > 0)) {
      throw new Error(`Estrutura invalida para o componente ${element.type}.`)
    }
    const visited = new Set<string>([element.id])
    let cursor = parent
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error('A hierarquia de elementos contem um ciclo.')
      visited.add(cursor.id)
      cursor = cursor.parentId ? elementById.get(cursor.parentId) ?? null : null
    }
    if (RESPONSE_ELEMENT_TYPES.has(element.type)) {
      const fieldKey = typeof element.content.fieldKey === 'string' ? element.content.fieldKey.trim() : ''
      if (!isValidResponseFieldKey(fieldKey)) {
        throw new Error('A chave de resposta e invalida ou usa um namespace reservado.')
      }
      if (responseKeyIdentities.has(funnelKeyIdentity(fieldKey))) throw new Error(`A chave de resposta "${fieldKey}" esta duplicada.`)
      responseKeys.add(fieldKey)
      responseKeyIdentities.add(funnelKeyIdentity(fieldKey))
    }
  }

  const variableKeys = new Set<string>()
  const variableKeyIdentities = new Set<string>()
  for (const variable of document.variables) {
    if (!variable || typeof variable !== 'object' || typeof variable.key !== 'string'
        || typeof variable.kind !== 'string' || variable.key.length > 128) {
      throw new Error('Uma das variaveis do funil e invalida.')
    }
    const key = variable.key.trim()
    if (variableKeyIdentities.has(funnelKeyIdentity(key))) throw new Error(`A variavel "${key}" esta duplicada.`)
    variableKeys.add(key)
    variableKeyIdentities.add(funnelKeyIdentity(key))

    const validKindContract = variable.kind === 'custom'
      ? isValidCustomVariableKey(key) && !responseKeyIdentities.has(funnelKeyIdentity(key))
      : variable.kind === 'answer'
        ? key.startsWith('answer.') && responseKeys.has(key.slice('answer.'.length))
        : variable.kind === 'lead'
          ? ['lead.first_name', 'lead.email', 'lead.phone', 'lead.score'].includes(key)
          : variable.kind === 'system'
            ? ['system.score', 'system.result', 'system.current_page'].includes(key)
            : variable.kind === 'utm'
              ? isSupportedFunnelUtmKey(key)
              : false
    if (!validKindContract) {
      throw new Error(`A variavel "${key}" conflita com uma resposta ou namespace reservado.`)
    }
  }

  const serialized = JSON.stringify(document)
  if (new TextEncoder().encode(serialized).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error('O funil excede o limite de 900 KB por salvamento.')
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const FLOW_OPERATORS = new Set([
  'equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty',
])
const FLOW_SOURCES = new Set(['answer', 'variable', 'score', 'utm'])

function isFlowScalar(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function assertImportedConditionGroup(value: unknown, visibility = false) {
  if (!isObject(value)
      || !['and', 'or'].includes(String(value.operator))
      || !Array.isArray(value.conditions)
      || value.conditions.length < 1
      || value.conditions.length > 50) {
    throw new Error('Uma condição do arquivo importado é inválida.')
  }
  for (const condition of value.conditions) {
    if (!isObject(condition)
        || typeof condition.id !== 'string'
        || !condition.id
        || condition.id.length > 160
        || typeof condition.operator !== 'string'
        || !FLOW_OPERATORS.has(condition.operator)
        || (condition.value !== undefined && !isFlowScalar(condition.value))) {
      throw new Error('Uma regra condicional do arquivo importado é inválida.')
    }
    if (visibility) {
      if (typeof condition.variable !== 'string' || !condition.variable.trim() || condition.variable.length > 160) {
        throw new Error('Uma condição de visibilidade não possui variável válida.')
      }
    } else if (typeof condition.source !== 'string'
        || !FLOW_SOURCES.has(condition.source)
        || typeof condition.key !== 'string'
        || (condition.source !== 'score' && !condition.key.trim())
        || condition.key.length > 160) {
      throw new Error('Uma condição do fluxo não possui origem ou chave válida.')
    }
  }
}

function assertImportedElementLogic(value: JsonObject, elementType: string, content: JsonObject) {
  const actionElement = elementType === 'button' || elementType === 'cta'
  const contentAction = content.action
  const contentTarget = content.target
  if (!actionElement && (contentAction !== undefined || contentTarget !== undefined)) {
    throw new Error('Acoes de conteudo so sao permitidas em Botao ou CTA.')
  }
  if (contentAction !== undefined && (
    typeof contentAction !== 'string'
    || !['next_page', 'previous_page', 'go_to_page', 'submit', 'open_url'].includes(contentAction)
  )) throw new Error('A acao de conteudo importada e invalida.')
  if (contentTarget !== undefined && (typeof contentTarget !== 'string' || contentTarget.length > 2048)) {
    throw new Error('O destino da acao importada e invalido.')
  }
  if (value.visibility !== undefined) assertImportedConditionGroup(value.visibility, true)
  if (value.actions !== undefined) {
    if (!Array.isArray(value.actions) || value.actions.length > 1) {
      throw new Error('As ações de um elemento importado são inválidas.')
    }
    if (value.actions.length > 0 && (
      !actionElement
      || (typeof contentAction === 'string' && Boolean(contentAction.trim()))
      || (typeof contentTarget === 'string' && Boolean(contentTarget.trim()))
    )) throw new Error('A acao importada conflita com o conteudo do elemento.')
    for (const action of value.actions) {
      if (!isObject(action)
          || typeof action.id !== 'string'
          || !action.id
          || action.trigger !== 'click'
          || !['next_page', 'previous_page', 'go_to_page', 'submit', 'open_url'].includes(String(action.type))
          || (action.target !== undefined && (typeof action.target !== 'string' || action.target.length > 2048))) {
        throw new Error('Uma ação de elemento importada é inválida.')
      }
    }
  }
  if (value.scoring !== undefined) {
    if (!Array.isArray(value.scoring) || value.scoring.length > 100) {
      throw new Error('As regras de pontuação de um elemento são inválidas.')
    }
    for (const rule of value.scoring) {
      if (!isObject(rule)
          || typeof rule.id !== 'string'
          || !rule.id
          || typeof rule.points !== 'number'
          || !Number.isFinite(rule.points)
          || (rule.value !== undefined && !isFlowScalar(rule.value))) {
        throw new Error('Uma regra de pontuação importada é inválida.')
      }
    }
  }
}

function assertImportedFlow(value: unknown, pageIds: Set<string>) {
  if (!isObject(value)) throw new Error('O fluxo do arquivo importado é inválido.')
  if (value.entryPageId !== undefined && (
    typeof value.entryPageId !== 'string' || !pageIds.has(value.entryPageId)
  )) throw new Error('A página inicial do fluxo importado é inválida.')

  for (const key of ['connections', 'scoringRules', 'resultRanges'] as const) {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      throw new Error(`A coleção ${key} do fluxo importado é inválida.`)
    }
  }

  const connections = (value.connections ?? []) as unknown[]
  const scoringRules = (value.scoringRules ?? []) as unknown[]
  const resultRanges = (value.resultRanges ?? []) as unknown[]
  if (connections.length > 2_000 || scoringRules.length > 1_000 || resultRanges.length > 500) {
    throw new Error('O fluxo importado excede os limites permitidos.')
  }

  for (const connection of connections) {
    if (!isObject(connection)
        || typeof connection.id !== 'string'
        || !connection.id
        || typeof connection.sourcePageId !== 'string'
        || !pageIds.has(connection.sourcePageId)
        || typeof connection.targetPageId !== 'string'
        || !pageIds.has(connection.targetPageId)
        || (connection.label !== undefined && typeof connection.label !== 'string')
        || (connection.priority !== undefined && (typeof connection.priority !== 'number' || !Number.isFinite(connection.priority)))
        || (connection.isDefault !== undefined && typeof connection.isDefault !== 'boolean')) {
      throw new Error('Uma conexão do fluxo importado é inválida.')
    }
    if (connection.condition !== undefined) assertImportedConditionGroup(connection.condition)
  }

  for (const rule of scoringRules) {
    if (!isObject(rule)
        || typeof rule.id !== 'string'
        || !rule.id
        || typeof rule.points !== 'number'
        || !Number.isFinite(rule.points)) {
      throw new Error('Uma regra de pontuação do fluxo importado é inválida.')
    }
    assertImportedConditionGroup(rule.condition)
  }

  for (const range of resultRanges) {
    if (!isObject(range)
        || typeof range.id !== 'string'
        || !range.id
        || typeof range.label !== 'string'
        || typeof range.sourcePageId !== 'string'
        || !pageIds.has(range.sourcePageId)
        || typeof range.targetPageId !== 'string'
        || !pageIds.has(range.targetPageId)
        || (range.minScore !== undefined && (typeof range.minScore !== 'number' || !Number.isFinite(range.minScore)))
        || (range.maxScore !== undefined && (typeof range.maxScore !== 'number' || !Number.isFinite(range.maxScore)))
        || (range.resultKey !== undefined && typeof range.resultKey !== 'string')) {
      throw new Error('Uma faixa de resultado do fluxo importado é inválida.')
    }
  }
}

function assertImportDocument(value: unknown): asserts value is FunnelDocument {
  if (!isObject(value) || value.schemaVersion !== 2) {
    throw new Error('O arquivo não contém um documento FunnelFlow V2 válido.')
  }

  if (typeof value.funnelId !== 'string' || !UUID_PATTERN.test(value.funnelId)) {
    throw new Error('O identificador do documento importado é inválido.')
  }

  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 160) {
    throw new Error('O nome do funil importado deve ter entre 1 e 160 caracteres.')
  }

  if (!isObject(value.settings)
      || !Array.isArray(value.pages)
      || !Array.isArray(value.elements)
      || !Array.isArray(value.variables)) {
    throw new Error('A estrutura do documento importado está incompleta.')
  }

  if (value.pages.length < 1 || value.pages.length > 100) {
    throw new Error('O funil importado deve conter entre 1 e 100 páginas.')
  }
  if (value.elements.length > 5_000 || value.variables.length > 500) {
    throw new Error('O arquivo excede o limite de elementos ou variáveis.')
  }

  const structuralIds = new Set<string>()
  const pageIds = new Set<string>()
  for (const page of value.pages) {
    if (!isObject(page)
        || typeof page.id !== 'string'
        || !UUID_PATTERN.test(page.id)
        || typeof page.name !== 'string'
        || !page.name.trim()
        || typeof page.slug !== 'string'
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)
        || !isObject(page.settings)) {
      throw new Error('Uma das páginas importadas é inválida.')
    }
    if (structuralIds.has(page.id)) throw new Error('O arquivo contém identificadores duplicados.')
    structuralIds.add(page.id)
    pageIds.add(page.id)
  }

  const elementPages = new Map<string, string>()
  for (const element of value.elements) {
    if (!isObject(element)
        || typeof element.id !== 'string'
        || !UUID_PATTERN.test(element.id)
        || typeof element.type !== 'string'
        || !(element.type in ELEMENT_REGISTRY)
        || typeof element.pageId !== 'string'
        || !pageIds.has(element.pageId)
        || (element.parentId !== null
          && (typeof element.parentId !== 'string' || !UUID_PATTERN.test(element.parentId)))
        || !isObject(element.content)
        || !isObject(element.styles)
        || !isObject(element.styles.desktop)
        || (element.styles.tablet !== undefined && !isObject(element.styles.tablet))
        || (element.styles.mobile !== undefined && !isObject(element.styles.mobile))
        || !isObject(element.logic)) {
      throw new Error('Um dos elementos importados é inválido ou não é suportado.')
    }
    if (structuralIds.has(element.id)) throw new Error('O arquivo contém identificadores duplicados.')
    structuralIds.add(element.id)
    elementPages.set(element.id, element.pageId)
    assertImportedElementLogic(element.logic, element.type, element.content)
  }

  for (const element of value.elements) {
    if (element.parentId && elementPages.get(element.parentId) !== element.pageId) {
      throw new Error('A hierarquia dos elementos importados é inválida.')
    }
    const visited = new Set<string>()
    let cursor: unknown = element
    while (isObject(cursor) && typeof cursor.parentId === 'string') {
      const parentId = cursor.parentId
      if (visited.has(parentId)) throw new Error('A hierarquia importada contém um ciclo.')
      visited.add(parentId)
      cursor = value.elements.find((candidate) => isObject(candidate) && candidate.id === parentId)
    }
  }

  const variableKeys = new Set<string>()
  for (const variable of value.variables) {
    if (!isObject(variable)
        || typeof variable.id !== 'string'
        || !UUID_PATTERN.test(variable.id)
        || typeof variable.key !== 'string'
        || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(variable.key)) {
      throw new Error('Uma das variáveis importadas é inválida.')
    }
    if (structuralIds.has(variable.id) || variableKeys.has(variable.key)) {
      throw new Error('O arquivo contém identificadores ou variáveis duplicados.')
    }
    structuralIds.add(variable.id)
    variableKeys.add(variable.key)
  }

  const importedFlow = value.flow ?? value.settings.flow
  if (importedFlow !== undefined) {
    assertImportedFlow(importedFlow, pageIds)
    value.flow = importedFlow
    value.settings.flow = importedFlow
    const validation = validateFunnelFlow(value as unknown as FunnelDocument)
    if (!validation.valid) {
      throw new Error(`O fluxo importado é inválido: ${validation.issues[0]?.message || 'corrija as conexões.'}`)
    }
  }

  assertDocument(value.funnelId, value as unknown as FunnelDocument)

  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw new Error('O documento importado excede o limite de 900 KB.')
  }
}

function normalizeImportPayload(payload: unknown): JsonObject {
  if (!isObject(payload)) throw new Error('Selecione um arquivo JSON válido.')
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('O arquivo de importação excede o limite permitido.')
  }

  if (payload.format === 'funnelflow.funnel') {
    if (payload.formatVersion !== 2) throw new Error('Esta versão de exportação não é suportada.')
    assertImportDocument(payload.document)
    return payload
  }

  assertImportDocument(payload)
  return payload
}

async function requireAuthenticatedClient() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Não autenticado.')
  return { supabase, user }
}

async function assertWorkspaceAccess(supabase: ServerSupabaseClient, workspaceId: string) {
  assertUuid(workspaceId, 'Workspace')
  const { data, error } = await supabase.rpc('can_manage_funnel_workspace', {
    p_workspace_id: workspaceId,
  })
  if (error || data !== true) throw new Error('Workspace não encontrado ou sem permissão.')
}

async function assertFunnelAccess(supabase: ServerSupabaseClient, funnelId: string) {
  assertUuid(funnelId, 'Funil')
  const { data, error } = await supabase
    .from('funnels')
    .select('id')
    .eq('id', funnelId)
    .maybeSingle()

  if (error || !data) throw new Error('Funil não encontrado ou sem permissão.')
}

function mutationError(error: { code?: string; message: string; hint?: string }, fallback: string): never {
  if (error.code === '40001') {
    throw new FunnelRevisionConflictError()
  }
  if (error.code === '42501') throw new Error('Você não tem permissão para alterar este funil.')
  throw new Error(error.message || fallback)
}

export async function createFunnel(formData: FormData): Promise<never> {
  const { supabase } = await requireAuthenticatedClient()
  const workspaceId = requiredString(formData.get('workspace_id'), 'Workspace', 36)
  const name = requiredString(formData.get('name'), 'Nome', 160)
  const description = optionalString(formData.get('description'), 2000)
  const requestedSlug = optionalString(formData.get('slug'), 120)

  await assertWorkspaceAccess(supabase, workspaceId)

  const { data, error } = await supabase
    .rpc('create_funnel', {
      p_workspace_id: workspaceId,
      p_name: name,
      p_description: description,
      p_slug: requestedSlug,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao criar funil.' }, 'Falha ao criar funil.')

  const created = data as unknown as CreateFunnelRpcRow
  const funnelId = String(created.funnel_id)
  assertUuid(funnelId, 'Funil criado')

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/funnels')
  redirect(`/dashboard/funnels/${funnelId}`)
}

export async function getFunnelDraft(funnelId: string) {
  const { supabase } = await requireAuthenticatedClient()
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase.rpc('get_funnel_draft', {
    p_funnel_id: funnelId,
  })
  if (error || !data) mutationError(error ?? { message: 'Falha ao carregar funil.' }, 'Falha ao carregar funil.')

  return data as {
    revision: number
    publishedRevision: number | null
    latestDraftVersionId: string | null
    publishedVersionId: string | null
    status: 'draft' | 'published' | 'archived'
    document: FunnelDocument
  }
}

export async function saveFunnelDraft(
  funnelId: string,
  expectedRevision: number,
  document: FunnelDocument,
  label?: string,
): Promise<DraftMutationResult> {
  const { supabase } = await requireAuthenticatedClient()
  assertRevision(expectedRevision)
  const persistentDocument: FunnelDocument = document.flow
    ? { ...document, settings: { ...document.settings, flow: document.flow } }
    : document
  assertDocument(funnelId, persistentDocument)
  if (label && label.trim().length > 160) throw new Error('O rótulo da versão excede 160 caracteres.')
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase
    .rpc('save_funnel_draft', {
      p_funnel_id: funnelId,
      p_expected_revision: expectedRevision,
      p_document: persistentDocument,
      p_label: label?.trim() || null,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao salvar rascunho.' }, 'Falha ao salvar rascunho.')

  revalidatePath(`/dashboard/funnels/${funnelId}`)
  revalidatePath('/dashboard/funnels')

  const saved = data as unknown as SaveDraftRpcRow
  return {
    funnelId: String(saved.funnel_id),
    revision: Number(saved.revision),
    versionId: String(saved.version_id),
    savedAt: String(saved.saved_at),
  }
}

export async function saveFunnelDraftFromBuilder(input: SaveDraftInput): Promise<SaveDraftResult> {
  try {
    const result = await saveFunnelDraft(
      input.funnelId,
      input.expectedRevision,
      input.document,
      input.label,
    )
    return { ok: true, revision: result.revision }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao salvar rascunho.',
      conflict: error instanceof FunnelRevisionConflictError,
    }
  }
}

export async function publishFunnel(
  funnelId: string,
  expectedRevision: number,
  requestedSlug?: string,
): Promise<PublicationResult> {
  const { supabase } = await requireAuthenticatedClient()
  assertRevision(expectedRevision)
  if (requestedSlug && requestedSlug.trim().length > 120) throw new Error('Slug excede 120 caracteres.')
  await assertFunnelAccess(supabase, funnelId)

  const { data: draft, error: draftError } = await supabase.rpc('get_funnel_draft', {
    p_funnel_id: funnelId,
  })
  if (draftError || !draft || typeof draft !== 'object') {
    throw new Error('Nao foi possivel validar o rascunho antes da publicacao.')
  }
  const document = (draft as { document?: FunnelDocument }).document
  if (!document) throw new Error('O rascunho do funil esta incompleto.')
  const validation = validateFunnelFlow(document)
  if (!validation.valid) {
    throw new Error(`Publicacao bloqueada: ${validation.issues[0]?.message || 'corrija o fluxo do funil.'}`)
  }

  const { data, error } = await supabase
    .rpc('publish_funnel', {
      p_funnel_id: funnelId,
      p_expected_revision: expectedRevision,
      p_slug: requestedSlug?.trim() || null,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao publicar funil.' }, 'Falha ao publicar funil.')

  revalidatePath(`/dashboard/funnels/${funnelId}`)
  revalidatePath('/dashboard/funnels')
  const published = data as unknown as PublishFunnelRpcRow
  revalidatePath(`/f/${published.slug}`)

  return {
    funnelId: String(published.funnel_id),
    revision: Number(published.revision),
    versionId: String(published.version_id),
    publicationId: String(published.publication_id),
    slug: String(published.slug),
    publishedAt: String(published.published_at),
  }
}

export async function publishFunnelFromBuilder(input: PublishFunnelInput): Promise<PublishFunnelResult> {
  try {
    const { supabase } = await requireAuthenticatedClient()
    assertRevision(input.expectedRevision)
    const persistentDocument: FunnelDocument = input.document.flow
      ? { ...input.document, settings: { ...input.document.settings, flow: input.document.flow } }
      : input.document
    assertDocument(input.funnelId, persistentDocument)
    await assertFunnelAccess(supabase, input.funnelId)

    const validation = validateFunnelFlow(persistentDocument)
    if (!validation.valid) {
      throw new Error(`Publicacao bloqueada: ${validation.issues[0]?.message || 'corrija o fluxo do funil.'}`)
    }

    // Saving and publishing share one database transaction. If authorization,
    // validation or publication fails, the draft revision is rolled back too.
    const { data, error } = await supabase
      .rpc('save_and_publish_funnel', {
        p_funnel_id: input.funnelId,
        p_expected_revision: input.expectedRevision,
        p_document: persistentDocument,
        p_slug: persistentDocument.slug || null,
      })
      .single()
    if (error || !data) mutationError(error ?? { message: 'Falha ao publicar funil.' }, 'Falha ao publicar funil.')

    const published = data as unknown as PublishFunnelRpcRow
    revalidatePath(`/dashboard/funnels/${input.funnelId}`)
    revalidatePath('/dashboard/funnels')
    revalidatePath(`/f/${published.slug}`)

    return {
      ok: true,
      revision: Number(published.revision),
      publishedUrl: `/f/${published.slug}`,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao publicar funil.',
      conflict: error instanceof FunnelRevisionConflictError,
    }
  }
}

export async function restoreFunnelVersion(
  funnelId: string,
  versionId: string,
  expectedRevision: number,
): Promise<DraftMutationResult & { restoredFromVersionId: string }> {
  const { supabase } = await requireAuthenticatedClient()
  assertUuid(versionId, 'Versão')
  assertRevision(expectedRevision)
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase
    .rpc('restore_funnel_version', {
      p_funnel_id: funnelId,
      p_version_id: versionId,
      p_expected_revision: expectedRevision,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao restaurar versão.' }, 'Falha ao restaurar versão.')

  revalidatePath(`/dashboard/funnels/${funnelId}`)

  const restored = data as unknown as RestoreVersionRpcRow
  return {
    funnelId: String(restored.funnel_id),
    revision: Number(restored.revision),
    versionId: String(restored.version_id),
    restoredFromVersionId: String(restored.restored_from_version_id),
    savedAt: String(restored.saved_at),
  }
}

export async function listFunnelVersions(funnelId: string, limit = 20) {
  const { supabase } = await requireAuthenticatedClient()
  await assertFunnelAccess(supabase, funnelId)
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20

  const { data, error } = await supabase
    .from('funnel_versions')
    .select('id, version_number, revision, kind, label, source_version_id, created_at')
    .eq('funnel_id', funnelId)
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function duplicateFunnelV2(funnelId: string) {
  const { supabase } = await requireAuthenticatedClient()
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase
    .rpc('duplicate_funnel', {
      p_funnel_id: funnelId,
      p_name: null,
      p_slug: null,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao duplicar funil.' }, 'Falha ao duplicar funil.')
  const duplicated = data as unknown as CreateFunnelRpcRow
  const duplicatedId = String(duplicated.funnel_id)
  assertUuid(duplicatedId, 'Funil duplicado')

  revalidatePath('/dashboard')
  return { funnelId: duplicatedId }
}

export async function setFunnelArchivedV2(funnelId: string, archived: boolean) {
  const { supabase } = await requireAuthenticatedClient()
  if (typeof archived !== 'boolean') throw new Error('Estado de arquivamento inválido.')
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase
    .rpc('set_funnel_archived', {
      p_funnel_id: funnelId,
      p_archived: archived,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao atualizar funil.' }, 'Falha ao atualizar funil.')
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/funnels/${funnelId}`)
  return { status: String((data as { status: string }).status) }
}

async function removeStoragePrefix(
  supabase: ServerSupabaseClient,
  bucket: 'funnel-uploads',
  rootPrefix: string,
) {
  const folders = [rootPrefix]
  const files: string[] = []

  while (folders.length > 0) {
    const prefix = folders.shift()!
    let offset = 0
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`Não foi possível preparar a exclusão dos arquivos de ${bucket}.`)
      for (const item of data ?? []) {
        const path = `${prefix}/${item.name}`
        if (item.id) files.push(path)
        else folders.push(path)
      }
      if ((data?.length ?? 0) < 100) break
      offset += data?.length ?? 0
      if (files.length + folders.length > 100_000) {
        throw new Error('O funil possui arquivos demais para exclusão segura em uma única operação.')
      }
    }
  }

  for (let index = 0; index < files.length; index += 100) {
    const { error } = await supabase.storage.from(bucket).remove(files.slice(index, index + 100))
    if (error) throw new Error(`Não foi possível excluir todos os arquivos de ${bucket}. Tente novamente.`)
  }
}

export async function deleteFunnelV2(funnelId: string, confirmationName: string) {
  const { supabase, user } = await requireAuthenticatedClient()
  if (typeof confirmationName !== 'string' || confirmationName.length > 160) {
    throw new Error('Confirmação de exclusão inválida.')
  }
  assertUuid(funnelId, 'Funil')
  const { data: funnel, error: funnelError } = await supabase
    .from('funnels')
    .select('id, name, workspace_id')
    .eq('id', funnelId)
    .maybeSingle()
  if (funnelError || !funnel) throw new Error('Funil não encontrado ou sem permissão.')
  if (confirmationName.trim() !== funnel.name) throw new Error('O nome de confirmação não corresponde ao funil.')

  const [{ data: workspace }, { data: membership }] = await Promise.all([
    supabase.from('workspaces').select('owner_id').eq('id', funnel.workspace_id).maybeSingle(),
    supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', funnel.workspace_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .maybeSingle(),
  ])
  if (workspace?.owner_id !== user.id && !membership) {
    throw new Error('Somente owners e administradores podem excluir este funil.')
  }

  // Visitor uploads are private and owned by this funnel, so they can be
  // removed safely. Public builder assets are deliberately retained: immutable
  // publications, templates and duplicated funnels may still reference the
  // original URLs. A future reference-aware garbage collector can reclaim them.
  await removeStoragePrefix(supabase, 'funnel-uploads', funnelId)

  const { error } = await supabase
    .rpc('delete_funnel', {
      p_funnel_id: funnelId,
      p_confirmation_name: confirmationName,
    })
    .single()

  if (error) mutationError(error, 'Falha ao excluir funil.')
  revalidatePath('/dashboard')
  return { deleted: true as const }
}

export async function exportFunnelV2(funnelId: string): Promise<FunnelExportV2> {
  const { supabase } = await requireAuthenticatedClient()
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase.rpc('export_funnel_v2', {
    p_funnel_id: funnelId,
  })
  if (error || !data) mutationError(error ?? { message: 'Falha ao exportar funil.' }, 'Falha ao exportar funil.')

  const payload = normalizeImportPayload(data)
  if (payload.format !== 'funnelflow.funnel') throw new Error('O banco retornou uma exportação incompatível.')
  return payload as unknown as FunnelExportV2
}

export async function importFunnelV2(workspaceId: string, untrustedPayload: unknown) {
  const { supabase } = await requireAuthenticatedClient()
  await assertWorkspaceAccess(supabase, workspaceId)
  const payload = normalizeImportPayload(untrustedPayload)

  const { data, error } = await supabase
    .rpc('import_funnel_v2', {
      p_workspace_id: workspaceId,
      p_payload: payload,
      p_name: null,
      p_slug: null,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao importar funil.' }, 'Falha ao importar funil.')
  const imported = data as unknown as CreateFunnelRpcRow
  const importedId = String(imported.funnel_id)
  assertUuid(importedId, 'Funil importado')

  revalidatePath('/dashboard')
  return { funnelId: importedId }
}

export async function createTemplateFromFunnelV2(funnelId: string) {
  const { supabase } = await requireAuthenticatedClient()
  await assertFunnelAccess(supabase, funnelId)

  const { data, error } = await supabase
    .rpc('create_funnel_template', {
      p_funnel_id: funnelId,
      p_name: null,
      p_description: null,
      p_category: 'Personalizado',
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao criar template.' }, 'Falha ao criar template.')
  revalidatePath('/dashboard')
  return { templateId: String((data as { template_id: string }).template_id) }
}

export async function createFunnelFromTemplateV2(templateId: string) {
  const { supabase } = await requireAuthenticatedClient()
  assertUuid(templateId, 'Template')

  const { data: template, error: templateError } = await supabase
    .from('funnel_templates')
    .select('id, workspace_id')
    .eq('id', templateId)
    .maybeSingle()
  if (templateError || !template) throw new Error('Template não encontrado ou sem permissão.')
  await assertWorkspaceAccess(supabase, String(template.workspace_id))

  const { data, error } = await supabase
    .rpc('create_funnel_from_template', {
      p_template_id: templateId,
      p_name: null,
      p_slug: null,
    })
    .single()

  if (error || !data) mutationError(error ?? { message: 'Falha ao usar template.' }, 'Falha ao usar template.')
  const created = data as unknown as CreateFunnelRpcRow
  const funnelId = String(created.funnel_id)
  assertUuid(funnelId, 'Funil criado')

  revalidatePath('/dashboard')
  return { funnelId }
}
