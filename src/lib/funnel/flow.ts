import type {
  ComparisonOperator,
  FlowCondition,
  FlowConditionGroup,
  FunnelDocument,
  FunnelFlowConnection,
  FunnelFlowDefinition,
  FunnelResultRange,
} from './types'
import {
  FUNNEL_UTM_KEYS,
  funnelKeyIdentity,
  isReservedFunnelKey,
  isSupportedFunnelUtmKey,
} from './keys'
import { normalizeFunnelOptions } from './options'

export interface FlowEvaluationContext {
  answers?: Record<string, unknown>
  variables?: Record<string, unknown>
  utms?: Record<string, unknown>
  score?: number
  /** Explicit go-to-page choice per source page id or slug, used by the simulator. */
  actions?: Record<string, string>
}

export type FlowDecisionKind = 'condition' | 'result' | 'default' | 'linear' | 'action' | 'terminal'

export interface FlowDecision {
  sourcePageId: string
  targetPageId: string | null
  kind: FlowDecisionKind
  score: number
  connectionId?: string
  resultRangeId?: string
  resultKey?: string
}

export type FlowValidationIssueCode =
  | 'missing_pages'
  | 'invalid_entry'
  | 'duplicate_connection'
  | 'invalid_connection_source'
  | 'invalid_connection_target'
  | 'invalid_action_target'
  | 'unsupported_action'
  | 'ambiguous_result_transition'
  | 'missing_reference'
  | 'invalid_key_contract'
  | 'missing_terminal_action'
  | 'missing_condition'
  | 'invalid_condition'
  | 'missing_default'
  | 'multiple_defaults'
  | 'condition_on_default'
  | 'invalid_score_rule'
  | 'invalid_result_range'
  | 'overlapping_result_range'
  | 'unreachable_page'
  | 'cycle_without_exit'
  | 'unreachable_result_range'

export interface FlowValidationIssue {
  code: FlowValidationIssueCode
  severity: 'error' | 'warning'
  message: string
  pageId?: string
  connectionId?: string
  elementId?: string
  resultRangeId?: string
}

export interface FlowValidationResult {
  valid: boolean
  issues: FlowValidationIssue[]
  entryPageId: string | null
  reachablePageIds: string[]
  terminalPageIds: string[]
}

export type FlowSimulationStopReason =
  | 'terminal'
  | 'cycle'
  | 'invalid_entry'
  | 'invalid_target'
  | 'max_steps'

export interface FlowSimulationResult {
  path: string[]
  decisions: FlowDecision[]
  score: number
  resultKey?: string
  stopReason: FlowSimulationStopReason
}

function orderedPages(document: FunnelDocument) {
  return [...document.pages].sort((a, b) => a.order - b.order)
}

export function getFunnelFlowDefinition(document: FunnelDocument): FunnelFlowDefinition | undefined {
  if (document.flow) return document.flow
  const fallback = document.settings.flow
  return fallback && typeof fallback === 'object' && !Array.isArray(fallback)
    ? fallback as FunnelFlowDefinition
    : undefined
}

function scalarEquals(actual: unknown, expected: unknown) {
  if (typeof actual === 'number' || typeof expected === 'number') {
    const left = Number(actual)
    const right = Number(expected)
    if (Number.isFinite(left) && Number.isFinite(right)) return left === right
  }
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    return String(actual).toLowerCase() === String(expected).toLowerCase()
  }
  return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase()
}

function isEmpty(value: unknown) {
  return value === undefined
    || value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0)
}

export function compareFlowValues(
  actual: unknown,
  operator: ComparisonOperator,
  expected?: string | number | boolean,
) {
  if (operator === 'is_empty') return isEmpty(actual)
  if (operator === 'is_not_empty') return !isEmpty(actual)
  if (operator === 'equals') {
    return Array.isArray(actual)
      ? actual.some((item) => scalarEquals(item, expected))
      : scalarEquals(actual, expected)
  }
  if (operator === 'not_equals') {
    return Array.isArray(actual)
      ? actual.every((item) => !scalarEquals(item, expected))
      : !scalarEquals(actual, expected)
  }
  if (operator === 'contains') {
    if (Array.isArray(actual)) return actual.some((item) => scalarEquals(item, expected))
    return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase())
  }

  const left = Number(actual)
  const right = Number(expected)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return operator === 'greater_than' ? left > right : left < right
}

function conditionValue(condition: FlowCondition, context: FlowEvaluationContext) {
  if (condition.source === 'score') return context.score ?? 0
  if (condition.source === 'utm') {
    return context.utms?.[condition.key]
  }
  if (condition.source === 'variable') {
    return context.variables?.[condition.key] ?? context.answers?.[condition.key]
  }
  return context.answers?.[condition.key]
}

export function evaluateFlowCondition(
  condition: FlowCondition,
  context: FlowEvaluationContext,
) {
  return compareFlowValues(
    conditionValue(condition, context),
    condition.operator,
    condition.value,
  )
}

export function evaluateFlowConditionGroup(
  group: FlowConditionGroup | undefined,
  context: FlowEvaluationContext,
) {
  if (!group?.conditions.length) return false
  return group.operator === 'and'
    ? group.conditions.every((condition) => evaluateFlowCondition(condition, context))
    : group.conditions.some((condition) => evaluateFlowCondition(condition, context))
}

function answerMatchesRule(answer: unknown, expected: unknown) {
  if (Array.isArray(answer)) return answer.some((item) => scalarEquals(item, expected))
  return scalarEquals(answer, expected)
}

export function calculateFunnelScore(
  document: FunnelDocument,
  context: Omit<FlowEvaluationContext, 'score'> = {},
  options: { elementAnswers?: Record<string, unknown> } = {},
) {
  let score = 0

  for (const element of document.elements) {
    const rules = element.logic.scoring ?? []
    if (!rules.length) continue
    const fieldKey = typeof element.content.fieldKey === 'string'
      ? element.content.fieldKey
      : element.id
    const answer = (options.elementAnswers ?? context.answers)?.[fieldKey]

    for (const rule of rules) {
      const matches = rule.value === undefined
        ? !isEmpty(answer)
        : answerMatchesRule(answer, rule.value)
      if (matches && Number.isFinite(rule.points)) score += rule.points
    }
  }

  for (const rule of getFunnelFlowDefinition(document)?.scoringRules ?? []) {
    if (!Number.isFinite(rule.points)) continue
    if (evaluateFlowConditionGroup(rule.condition, { ...context, score })) {
      score += rule.points
    }
  }

  return score
}

export function getFlowEntryPageId(document: FunnelDocument) {
  const pages = orderedPages(document)
  const configured = getFunnelFlowDefinition(document)?.entryPageId
  if (configured && pages.some((page) => page.id === configured)) return configured
  return pages[0]?.id ?? null
}

export function createLinearFlowConnections(document: FunnelDocument): FunnelFlowConnection[] {
  const pages = orderedPages(document)
  return pages.slice(0, -1).map((page, index) => ({
    id: `linear:${page.id}:${pages[index + 1].id}`,
    sourcePageId: page.id,
    targetPageId: pages[index + 1].id,
    label: 'Próxima página',
    priority: 0,
    isDefault: true,
  }))
}

export function hasExplicitFlow(document: FunnelDocument) {
  const flow = getFunnelFlowDefinition(document)
  return flow?.connections !== undefined || flow?.resultRanges !== undefined
}

export function getEffectiveFlowConnections(document: FunnelDocument) {
  return getFunnelFlowDefinition(document)?.connections ?? createLinearFlowConnections(document)
}

export function materializeFunnelFlow(document: FunnelDocument): FunnelFlowDefinition {
  const flow = getFunnelFlowDefinition(document)
  return {
    ...flow,
    entryPageId: getFlowEntryPageId(document) ?? undefined,
    connections: flow?.connections ?? createLinearFlowConnections(document),
    scoringRules: flow?.scoringRules ?? [],
    resultRanges: flow?.resultRanges ?? [],
  }
}

function resultRangeMatches(range: FunnelResultRange, score: number) {
  const aboveMinimum = range.minScore === undefined || score >= range.minScore
  const belowMaximum = range.maxScore === undefined || score <= range.maxScore
  return aboveMinimum && belowMaximum
}

export function resolveFunnelDecision(
  document: FunnelDocument,
  sourcePageId: string,
  rawContext: FlowEvaluationContext = {},
): FlowDecision {
  const score = rawContext.score ?? calculateFunnelScore(document, rawContext)
  const context = { ...rawContext, score }
  const connections = getEffectiveFlowConnections(document)
    .filter((connection) => connection.sourcePageId === sourcePageId)
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))

  const conditional = connections.find((connection) => (
    !connection.isDefault
    && evaluateFlowConditionGroup(connection.condition, context)
  ))
  if (conditional) {
    return {
      sourcePageId,
      targetPageId: conditional.targetPageId,
      kind: 'condition',
      score,
      connectionId: conditional.id,
    }
  }

  const result = (getFunnelFlowDefinition(document)?.resultRanges ?? [])
    .filter((range) => range.sourcePageId === sourcePageId)
    .find((range) => resultRangeMatches(range, score))
  if (result) {
    return {
      sourcePageId,
      targetPageId: result.targetPageId,
      kind: 'result',
      score,
      resultRangeId: result.id,
      resultKey: result.resultKey || result.label,
    }
  }

  const fallback = connections.find((connection) => connection.isDefault)
  if (fallback) {
    return {
      sourcePageId,
      targetPageId: fallback.targetPageId,
      kind: hasExplicitFlow(document) ? 'default' : 'linear',
      score,
      connectionId: fallback.id,
    }
  }

  return { sourcePageId, targetPageId: null, kind: 'terminal', score }
}

export function resolveNextFunnelPage(
  document: FunnelDocument,
  sourcePageId: string,
  context: FlowEvaluationContext = {},
) {
  return resolveFunnelDecision(document, sourcePageId, context).targetPageId
}

function validateConditionGroup(
  group: FlowConditionGroup | undefined,
  owner: { pageId?: string; connectionId?: string },
): FlowValidationIssue[] {
  if (!group?.conditions.length) {
    return [{
      code: 'invalid_condition',
      severity: 'error',
      message: 'A condição precisa ter ao menos uma regra.',
      ...owner,
    }]
  }

  return group.conditions.flatMap((condition) => {
    const needsValue = !['is_empty', 'is_not_empty'].includes(condition.operator)
    if ((!condition.key.trim() && condition.source !== 'score') || (needsValue && condition.value === undefined)) {
      return [{
        code: 'invalid_condition' as const,
        severity: 'error' as const,
        message: 'Há uma condição sem chave ou valor.',
        ...owner,
      }]
    }
    return []
  })
}

const ACTION_ELEMENT_TYPES = new Set(['button', 'cta'])
const ACTION_TYPES = new Set(['next_page', 'previous_page', 'go_to_page', 'submit', 'open_url'])

function supportedContentAction(element: FunnelDocument['elements'][number]) {
  if (!ACTION_ELEMENT_TYPES.has(element.type)) return undefined
  const action = element.content.action
  return typeof action === 'string' && ACTION_TYPES.has(action) ? action : undefined
}

function supportedLogicAction(element: FunnelDocument['elements'][number]) {
  const actions = element.logic.actions ?? []
  const contentAction = typeof element.content.action === 'string' ? element.content.action.trim() : ''
  if (!ACTION_ELEMENT_TYPES.has(element.type)
      || actions.length !== 1
      || actions[0].trigger !== 'click'
      || contentAction) return undefined
  return actions[0]
}

function hasUnsupportedActionContract(element: FunnelDocument['elements'][number]) {
  const actions = element.logic.actions ?? []
  const rawContentAction = element.content.action
  const rawContentTarget = element.content.target
  if (!ACTION_ELEMENT_TYPES.has(element.type)) {
    return actions.length > 0 || rawContentAction !== undefined || rawContentTarget !== undefined
  }
  if (rawContentAction !== undefined && (
    typeof rawContentAction !== 'string' || !ACTION_TYPES.has(rawContentAction)
  )) return true
  if (rawContentTarget !== undefined && typeof rawContentTarget !== 'string') return true
  if (!actions.length) return false
  return actions.length !== 1
    || actions[0].trigger !== 'click'
    || (typeof rawContentAction === 'string' && Boolean(rawContentAction.trim()))
    || (typeof rawContentTarget === 'string' && Boolean(rawContentTarget.trim()))
}

function actionTargets(element: FunnelDocument['elements'][number]) {
  const targets: Array<string | undefined> = []
  const logicAction = supportedLogicAction(element)
  if (logicAction?.type === 'go_to_page') targets.push(logicAction.target)
  if (supportedContentAction(element) === 'go_to_page') targets.push(element.content.target as string | undefined)
  return Array.from(new Set(targets.filter((target): target is string => typeof target === 'string' && Boolean(target))))
}

function hasMissingPageActionTarget(element: FunnelDocument['elements'][number]) {
  const contentTarget = element.content.target
  if (supportedContentAction(element) === 'go_to_page' && (
    typeof contentTarget !== 'string' || !contentTarget.trim()
  )) return true
  const logicAction = supportedLogicAction(element)
  return logicAction?.type === 'go_to_page'
    && (typeof logicAction.target !== 'string' || !logicAction.target.trim())
}

function hasSubmitAction(element: FunnelDocument['elements'][number]) {
  return supportedContentAction(element) === 'submit'
    || supportedLogicAction(element)?.type === 'submit'
}

function isUnconditionallyVisible(document: FunnelDocument, element: FunnelDocument['elements'][number]) {
  const byId = new Map(document.elements.map((candidate) => [candidate.id, candidate]))
  const visited = new Set<string>()
  let cursor: FunnelDocument['elements'][number] | undefined = element
  while (cursor) {
    if (visited.has(cursor.id) || cursor.logic.visibility) return false
    visited.add(cursor.id)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return true
}

function hasUnconditionalTerminalAction(document: FunnelDocument, pageId: string, noOutgoingEdges: boolean) {
  return document.elements.some((element) => {
    if (element.pageId !== pageId || !isUnconditionallyVisible(document, element)) return false
    const action = supportedContentAction(element) ?? supportedLogicAction(element)?.type
    return action === 'submit' || (noOutgoingEdges && action === 'next_page')
  })
}

function rangesOverlap(left: FunnelResultRange, right: FunnelResultRange) {
  const leftMin = left.minScore ?? Number.NEGATIVE_INFINITY
  const leftMax = left.maxScore ?? Number.POSITIVE_INFINITY
  const rightMin = right.minScore ?? Number.NEGATIVE_INFINITY
  const rightMax = right.maxScore ?? Number.POSITIVE_INFINITY
  return leftMin <= rightMax && rightMin <= leftMax
}

export function validateFunnelFlow(document: FunnelDocument): FlowValidationResult {
  const issues: FlowValidationIssue[] = []
  const pages = orderedPages(document)
  const flow = getFunnelFlowDefinition(document)
  const pageIds = new Set(pages.map((page) => page.id))
  const pageBySlug = new Map(pages.map((page) => [page.slug, page.id]))
  const entryPageId = getFlowEntryPageId(document)
  const responseKeys = new Set(document.elements.flatMap((element) => (
    typeof element.content.fieldKey === 'string' && element.content.fieldKey.trim()
      ? [element.content.fieldKey.trim()]
      : []
  )))
  const customVariableKeys = new Set(document.variables
    .filter((variable) => variable.kind === 'custom')
    .map((variable) => funnelKeyIdentity(variable.key)))
  const responseKeyIdentities = new Set([...responseKeys].map(funnelKeyIdentity))
  for (const key of responseKeys) {
    if (isReservedFunnelKey(key) || customVariableKeys.has(funnelKeyIdentity(key))) {
      issues.push({ code: 'invalid_key_contract', severity: 'error', message: `A chave de resposta "${key}" usa um namespace reservado ou conflita com uma variavel.` })
    }
  }
  const seenCustomKeys = new Set<string>()
  for (const variable of document.variables.filter((candidate) => candidate.kind === 'custom')) {
    const key = variable.key.trim()
    const identity = funnelKeyIdentity(key)
    if (isReservedFunnelKey(key) || responseKeyIdentities.has(identity) || seenCustomKeys.has(identity)) {
      issues.push({ code: 'invalid_key_contract', severity: 'error', message: `A variavel "${key}" usa um namespace reservado ou uma chave duplicada.` })
    }
    seenCustomKeys.add(identity)
  }
  const variableKeys = new Set([
    ...document.variables.map((variable) => variable.key),
    ...responseKeys,
    'lead.first_name', 'lead.email', 'lead.phone', 'lead.score',
    'system.score', 'system.result', 'system.current_page',
    ...FUNNEL_UTM_KEYS,
  ])
  const visibilityVariableKeys = new Set([
    ...variableKeys,
    ...[...responseKeys].map((key) => `answer.${key}`),
  ])
  const validateReferences = (group: FlowConditionGroup | undefined, owner: { pageId?: string; connectionId?: string } = {}) => {
    if (!group) return
    for (const condition of group.conditions) {
      const valid = condition.source === 'answer'
        ? responseKeys.has(condition.key)
        : condition.source === 'utm'
          ? isSupportedFunnelUtmKey(condition.key)
          : condition.source === 'score' || variableKeys.has(condition.key)
      if (!valid) issues.push({ code: 'missing_reference', severity: 'error', message: 'Uma condicao usa uma resposta ou variavel que nao existe.', ...owner })
    }
  }

  if (!pages.length) {
    issues.push({ code: 'missing_pages', severity: 'error', message: 'O funil precisa ter ao menos uma página.' })
    return { valid: false, issues, entryPageId: null, reachablePageIds: [], terminalPageIds: [] }
  }

  if (!entryPageId || !pageIds.has(entryPageId)) {
    issues.push({ code: 'invalid_entry', severity: 'error', message: 'A página de entrada não existe.' })
  }

  if (flow?.entryPageId && !pageIds.has(flow.entryPageId)) {
    issues.push({ code: 'invalid_entry', severity: 'error', message: 'A página de entrada configurada foi excluída.', pageId: flow.entryPageId })
  }

  const connections = getEffectiveFlowConnections(document)
  const connectionIds = new Set<string>()
  const validEdges = new Map<string, Set<string>>()
  const addEdge = (source: string, target: string) => {
    if (!validEdges.has(source)) validEdges.set(source, new Set())
    validEdges.get(source)!.add(target)
  }

  for (const connection of connections) {
    if (connectionIds.has(connection.id)) {
      issues.push({ code: 'duplicate_connection', severity: 'error', message: 'Duas conexões usam o mesmo identificador.', connectionId: connection.id, pageId: connection.sourcePageId })
    }
    connectionIds.add(connection.id)

    if (!pageIds.has(connection.sourcePageId)) {
      issues.push({ code: 'invalid_connection_source', severity: 'error', message: 'A origem de uma conexão não existe.', connectionId: connection.id, pageId: connection.sourcePageId })
    }
    if (!pageIds.has(connection.targetPageId)) {
      issues.push({ code: 'invalid_connection_target', severity: 'error', message: 'O destino de uma conexão não existe.', connectionId: connection.id, pageId: connection.sourcePageId })
    }
    if (pageIds.has(connection.sourcePageId) && pageIds.has(connection.targetPageId)) {
      addEdge(connection.sourcePageId, connection.targetPageId)
    }

    if (connection.isDefault && connection.condition?.conditions.length) {
      issues.push({ code: 'condition_on_default', severity: 'error', message: 'A rota padrão não pode ter condição.', connectionId: connection.id, pageId: connection.sourcePageId })
    }
    if (!connection.isDefault) {
      if (!connection.condition?.conditions.length) {
        issues.push({ code: 'missing_condition', severity: 'error', message: 'Uma rota condicional precisa ter uma condição.', connectionId: connection.id, pageId: connection.sourcePageId })
      } else {
        issues.push(...validateConditionGroup(connection.condition, { connectionId: connection.id, pageId: connection.sourcePageId }))
        validateReferences(connection.condition, { connectionId: connection.id, pageId: connection.sourcePageId })
      }
    }
  }

  for (const page of pages) {
    const outgoing = connections.filter((connection) => connection.sourcePageId === page.id)
    const defaults = outgoing.filter((connection) => connection.isDefault)
    const hasBranches = outgoing.some((connection) => !connection.isDefault)
      || (flow?.resultRanges ?? []).some((range) => range.sourcePageId === page.id)
    if (defaults.length > 1) {
      issues.push({ code: 'multiple_defaults', severity: 'error', message: 'A página possui mais de um destino padrão.', pageId: page.id })
    }
    if (hasBranches && defaults.length === 0) {
      issues.push({ code: 'missing_default', severity: 'error', message: 'Toda ramificação precisa de um destino padrão.', pageId: page.id })
    }
  }

  for (const rule of flow?.scoringRules ?? []) {
    if (!Number.isFinite(rule.points)) {
      issues.push({ code: 'invalid_score_rule', severity: 'error', message: 'Uma regra de pontuação possui valor inválido.' })
    }
    issues.push(...validateConditionGroup(rule.condition, {}))
    validateReferences(rule.condition)
  }

  const connectionPairs = new Set(connections.map((connection) => (
    `${connection.sourcePageId}:${connection.targetPageId}`
  )))
  const directActionPairs = new Set(document.elements.flatMap((element) => actionTargets(element).flatMap((target) => {
    const targetId = pageIds.has(target) ? target : pageBySlug.get(target)
    return targetId ? [`${element.pageId}:${targetId}`] : []
  })))
  const rangesBySource = new Map<string, FunnelResultRange[]>()
  for (const range of flow?.resultRanges ?? []) {
    if (!rangesBySource.has(range.sourcePageId)) rangesBySource.set(range.sourcePageId, [])
    rangesBySource.get(range.sourcePageId)!.push(range)
    const invalidBounds = (range.minScore !== undefined && !Number.isFinite(range.minScore))
      || (range.maxScore !== undefined && !Number.isFinite(range.maxScore))
      || (range.minScore !== undefined && range.maxScore !== undefined && range.minScore > range.maxScore)
    if (!pageIds.has(range.sourcePageId) || !pageIds.has(range.targetPageId) || invalidBounds) {
      issues.push({ code: 'invalid_result_range', severity: 'error', message: 'Uma faixa de resultado possui página ou limite inválido.', pageId: range.sourcePageId, resultRangeId: range.id })
    } else {
      const transitionKey = `${range.sourcePageId}:${range.targetPageId}`
      if (connectionPairs.has(transitionKey) || directActionPairs.has(transitionKey)) {
        issues.push({ code: 'ambiguous_result_transition', severity: 'error', message: 'Uma faixa de resultado nao pode usar o mesmo trajeto de outra conexao ou botao.', pageId: range.sourcePageId, resultRangeId: range.id })
      }
      addEdge(range.sourcePageId, range.targetPageId)
    }
  }

  for (const [sourcePageId, ranges] of rangesBySource) {
    for (let left = 0; left < ranges.length; left += 1) {
      for (let right = left + 1; right < ranges.length; right += 1) {
        if (rangesOverlap(ranges[left], ranges[right])) {
          issues.push({ code: 'overlapping_result_range', severity: 'error', message: 'Faixas de resultado da mesma página não podem se sobrepor.', pageId: sourcePageId, resultRangeId: ranges[right].id })
        }
      }
    }
  }

  // Result ranges are only ever consulted from the 'next_page' branch of
  // handleAction (funnel-player.tsx) — a page whose only visible button
  // uses action:'submit' calls submit() directly and never reaches
  // resolveFunnelDecision, so any resultRange declared on that page would
  // silently never fire in production. This mirrors the same check already
  // enforced for CLI-built templates in scripts/funnel-doc-validator.ts,
  // now applied to every funnel published from the editor.
  for (const [sourcePageId, ranges] of rangesBySource) {
    const pageElements = document.elements.filter((element) => element.pageId === sourcePageId)
    const hasUsableNextPageButton = pageElements.some((element) => (
      isUnconditionallyVisible(document, element)
        && (supportedContentAction(element) === 'next_page' || supportedLogicAction(element)?.type === 'next_page')
    ))
    const onlyHasSubmitButton = pageElements.some((element) => (
      isUnconditionallyVisible(document, element) && hasSubmitAction(element)
    )) && !hasUsableNextPageButton
    if (onlyHasSubmitButton) {
      for (const range of ranges) {
        issues.push({ code: 'unreachable_result_range', severity: 'error', message: `A faixa de resultado "${range.label}" nunca seria alcançada: o botão dessa página usa "Enviar" em vez de "Próxima página", e faixas de resultado só são avaliadas ao avançar de página.`, pageId: sourcePageId, resultRangeId: range.id })
      }
    }
  }

  for (const element of document.elements) {
    const optionValues = normalizeFunnelOptions(element.content.options).map((option) => option.value)
    for (const rule of element.logic.scoring ?? []) {
      const valueIsInvalidChoice = element.type === 'quiz_choice'
        && (rule.value === undefined || !optionValues.includes(String(rule.value)))
      const numericValue = Number(rule.value)
      const valueIsInvalidRange = ['slider', 'rating'].includes(element.type)
        && (!Number.isFinite(numericValue)
          || (element.content.min !== undefined && numericValue < Number(element.content.min))
          || (element.content.max !== undefined && numericValue > Number(element.content.max)))
      if (!Number.isFinite(rule.points) || valueIsInvalidChoice || valueIsInvalidRange) {
        issues.push({ code: 'invalid_score_rule', severity: 'error', message: 'Uma regra de pontuacao usa uma opcao ou valor invalido.', pageId: element.pageId, elementId: element.id })
      }
    }
    for (const condition of element.logic.visibility?.conditions ?? []) {
      if (!visibilityVariableKeys.has(condition.variable)) {
        issues.push({ code: 'missing_reference', severity: 'error', message: 'Uma condicao de visibilidade usa uma resposta ou variavel que nao existe.', pageId: element.pageId, elementId: element.id })
      }
    }
    if (hasUnsupportedActionContract(element)) {
      issues.push({ code: 'unsupported_action', severity: 'error', message: 'Acoes so podem ser usadas em Botao ou CTA, com um unico clique configurado.', pageId: element.pageId, elementId: element.id })
    }
    if (hasMissingPageActionTarget(element)) {
      issues.push({ code: 'invalid_action_target', severity: 'error', message: 'Um botão precisa ter uma página de destino.', pageId: element.pageId, elementId: element.id })
    }
    for (const target of actionTargets(element)) {
      const targetId = pageIds.has(target) ? target : pageBySlug.get(target)
      if (!targetId) {
        issues.push({ code: 'invalid_action_target', severity: 'error', message: 'Um botão aponta para uma página inexistente.', pageId: element.pageId, elementId: element.id })
        continue
      }
      if (pageIds.has(element.pageId)) addEdge(element.pageId, targetId)
    }
  }

  const reachable = new Set<string>()
  if (entryPageId && pageIds.has(entryPageId)) {
    const queue = [entryPageId]
    while (queue.length) {
      const pageId = queue.shift()!
      if (reachable.has(pageId)) continue
      reachable.add(pageId)
      for (const target of validEdges.get(pageId) ?? []) {
        if (!reachable.has(target)) queue.push(target)
      }
    }
  }

  for (const page of pages) {
    if (!reachable.has(page.id)) {
      issues.push({ code: 'unreachable_page', severity: 'error', message: `A página “${page.name}” não pode ser alcançada a partir da entrada.`, pageId: page.id })
    }
  }

  const submitPages = new Set(document.elements
    .filter((element) => hasSubmitAction(element) && isUnconditionallyVisible(document, element))
    .map((element) => element.pageId))
  const terminals = pages
    .filter((page) => (validEdges.get(page.id)?.size ?? 0) === 0 || submitPages.has(page.id))
    .map((page) => page.id)
  for (const pageId of terminals) {
    const noOutgoingEdges = (validEdges.get(pageId)?.size ?? 0) === 0
    if (!hasUnconditionalTerminalAction(document, pageId, noOutgoingEdges)) {
      issues.push({ code: 'missing_terminal_action', severity: 'error', message: 'Toda pagina final precisa de um Botao ou CTA visivel para concluir o funil.', pageId })
    }
  }
  const reverse = new Map<string, Set<string>>()
  for (const [source, targets] of validEdges) {
    for (const target of targets) {
      if (!reverse.has(target)) reverse.set(target, new Set())
      reverse.get(target)!.add(source)
    }
  }
  const canExit = new Set(terminals)
  const exitQueue = [...terminals]
  while (exitQueue.length) {
    const target = exitQueue.shift()!
    for (const source of reverse.get(target) ?? []) {
      if (canExit.has(source)) continue
      canExit.add(source)
      exitQueue.push(source)
    }
  }

  for (const pageId of reachable) {
    if (!canExit.has(pageId)) {
      const page = pages.find((item) => item.id === pageId)
      issues.push({ code: 'cycle_without_exit', severity: 'error', message: `O caminho que passa por “${page?.name ?? pageId}” entra em um ciclo sem saída.`, pageId })
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    entryPageId,
    reachablePageIds: [...reachable],
    terminalPageIds: terminals,
  }
}

export function simulateFunnelPath(
  document: FunnelDocument,
  context: FlowEvaluationContext = {},
  maxSteps = Math.max(10, document.pages.length * 3),
): FlowSimulationResult {
  const score = context.score ?? calculateFunnelScore(document, context)
  const entryPageId = getFlowEntryPageId(document)
  if (!entryPageId) {
    return { path: [], decisions: [], score, stopReason: 'invalid_entry' }
  }

  const pageIds = new Set(document.pages.map((page) => page.id))
  const path: string[] = []
  const decisions: FlowDecision[] = []
  const visited = new Set<string>()
  let currentPageId = entryPageId
  let resultKey: string | undefined

  for (let step = 0; step < maxSteps; step += 1) {
    if (!pageIds.has(currentPageId)) {
      return { path, decisions, score, resultKey, stopReason: 'invalid_target' }
    }
    if (visited.has(currentPageId)) {
      path.push(currentPageId)
      return { path, decisions, score, resultKey, stopReason: 'cycle' }
    }

    path.push(currentPageId)
    visited.add(currentPageId)
    const currentPage = document.pages.find((page) => page.id === currentPageId)
    const requestedActionTarget = context.actions?.[currentPageId]
      ?? (currentPage ? context.actions?.[currentPage.slug] : undefined)
    let decision: FlowDecision
    if (requestedActionTarget) {
      const requestedPage = document.pages.find((page) => (
        page.id === requestedActionTarget || page.slug === requestedActionTarget
      ))
      const allowedTargets = new Set(document.elements
        .filter((element) => element.pageId === currentPageId)
        .flatMap(actionTargets))
      const targetAllowed = requestedPage && (
        allowedTargets.has(requestedPage.id) || allowedTargets.has(requestedPage.slug)
      )
      if (!requestedPage || !targetAllowed) {
        return { path, decisions, score, resultKey, stopReason: 'invalid_target' }
      }
      decision = {
        sourcePageId: currentPageId,
        targetPageId: requestedPage.id,
        kind: 'action',
        score,
      }
    } else {
      decision = resolveFunnelDecision(document, currentPageId, { ...context, score })
    }
    decisions.push(decision)
    if (decision.resultKey) resultKey = decision.resultKey
    if (!decision.targetPageId) {
      return { path, decisions, score, resultKey, stopReason: 'terminal' }
    }
    if (!pageIds.has(decision.targetPageId)) {
      return { path, decisions, score, resultKey, stopReason: 'invalid_target' }
    }
    currentPageId = decision.targetPageId
  }

  return { path, decisions, score, resultKey, stopReason: 'max_steps' }
}
