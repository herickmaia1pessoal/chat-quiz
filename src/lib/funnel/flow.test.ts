import { describe, expect, it } from 'vitest'

import {
  calculateFunnelScore,
  createLinearFlowConnections,
  evaluateFlowConditionGroup,
  resolveFunnelDecision,
  simulateFunnelPath,
  validateFunnelFlow,
} from './flow'
import {
  FUNNEL_SCHEMA_VERSION,
  type ElementLogic,
  type ElementType,
  type FunnelDocument,
  type FunnelElement,
  type FunnelFlowDefinition,
  type FunnelPage,
} from './types'

function makePage(id: string, order: number): FunnelPage {
  return { id, name: `Page ${id}`, slug: `page-${id}`, order, settings: {} }
}

function makeElement(
  id: string,
  type: ElementType,
  pageId: string,
  content: Record<string, unknown> = {},
  logic: ElementLogic = {},
): FunnelElement {
  return {
    id,
    type,
    pageId,
    parentId: null,
    slot: 'default',
    order: 0,
    content,
    styles: { desktop: {} },
    logic,
  }
}

function makeDocument(
  pageIds: string[],
  flow?: FunnelFlowDefinition,
  elements: FunnelElement[] = [],
): FunnelDocument {
  return {
    schemaVersion: FUNNEL_SCHEMA_VERSION,
    funnelId: 'funnel-test',
    title: 'Test funnel',
    slug: 'test-funnel',
    settings: {},
    pages: pageIds.map(makePage),
    elements,
    variables: [],
    flow,
  }
}

describe('flow conditions and route resolution', () => {
  it('evaluates AND/OR groups across answers, variables, UTMs, and score', () => {
    const context = {
      answers: { plan: 'Pro', interests: ['growth', 'sales'] },
      variables: { segment: 'clinic' },
      utms: { utm_source: 'google' },
      score: 18,
    }

    expect(evaluateFlowConditionGroup({
      operator: 'and',
      conditions: [
        { id: 'c1', source: 'answer', key: 'plan', operator: 'equals', value: 'pro' },
        { id: 'c2', source: 'variable', key: 'segment', operator: 'equals', value: 'clinic' },
        { id: 'c3', source: 'utm', key: 'utm_source', operator: 'contains', value: 'goo' },
        { id: 'c4', source: 'score', key: '', operator: 'greater_than', value: 10 },
      ],
    }, context)).toBe(true)

    expect(evaluateFlowConditionGroup({
      operator: 'or',
      conditions: [
        { id: 'c5', source: 'answer', key: 'plan', operator: 'equals', value: 'basic' },
        { id: 'c6', source: 'answer', key: 'interests', operator: 'contains', value: 'sales' },
      ],
    }, context)).toBe(true)
  })

  it('chooses the first matching conditional route by priority and otherwise uses the default', () => {
    const document = makeDocument(['a', 'b', 'c', 'd'], {
      entryPageId: 'a',
      connections: [
        {
          id: 'later-match',
          sourcePageId: 'a',
          targetPageId: 'b',
          priority: 20,
          condition: {
            operator: 'and',
            conditions: [{ id: 'c1', source: 'answer', key: 'plan', operator: 'equals', value: 'pro' }],
          },
        },
        {
          id: 'first-match',
          sourcePageId: 'a',
          targetPageId: 'c',
          priority: 1,
          condition: {
            operator: 'and',
            conditions: [{ id: 'c2', source: 'utm', key: 'utm_source', operator: 'equals', value: 'ads' }],
          },
        },
        { id: 'fallback', sourcePageId: 'a', targetPageId: 'd', isDefault: true },
      ],
    })

    const matched = resolveFunnelDecision(document, 'a', {
      answers: { plan: 'pro' },
      utms: { utm_source: 'ads' },
    })
    expect(matched).toMatchObject({
      kind: 'condition',
      targetPageId: 'c',
      connectionId: 'first-match',
    })

    const fallback = resolveFunnelDecision(document, 'a', { answers: { plan: 'basic' } })
    expect(fallback).toMatchObject({
      kind: 'default',
      targetPageId: 'd',
      connectionId: 'fallback',
    })
  })

  it('creates and resolves the implicit linear flow using page order', () => {
    const document = makeDocument(['third', 'first', 'second'])
    document.pages = [makePage('third', 2), makePage('first', 0), makePage('second', 1)]

    expect(createLinearFlowConnections(document).map((connection) => [
      connection.sourcePageId,
      connection.targetPageId,
    ])).toEqual([
      ['first', 'second'],
      ['second', 'third'],
    ])
    expect(resolveFunnelDecision(document, 'first')).toMatchObject({
      kind: 'linear',
      targetPageId: 'second',
    })
    expect(resolveFunnelDecision(document, 'third')).toMatchObject({
      kind: 'terminal',
      targetPageId: null,
    })
  })
})

describe('flow scoring and result ranges', () => {
  it('combines element scoring with conditional scoring rules', () => {
    const question = makeElement(
      'question',
      'quiz_choice',
      'a',
      { fieldKey: 'qualified' },
      {
        scoring: [
          { id: 'yes', value: 'yes', points: 10 },
          { id: 'answered', points: 2 },
        ],
      },
    )
    const document = makeDocument(['a'], {
      scoringRules: [{
        id: 'score-bonus',
        points: 5,
        condition: {
          operator: 'and',
          conditions: [{ id: 'threshold', source: 'score', key: '', operator: 'greater_than', value: 9 }],
        },
      }],
    }, [question])

    expect(calculateFunnelScore(document, { answers: { qualified: 'yes' } })).toBe(17)
    expect(calculateFunnelScore(document, { answers: { qualified: 'no' } })).toBe(2)
  })

  it('routes by score range before the default and exposes the result in simulation', () => {
    const question = makeElement(
      'question',
      'quiz_choice',
      'a',
      { fieldKey: 'qualified' },
      { scoring: [{ id: 'yes', value: 'yes', points: 15 }] },
    )
    const document = makeDocument(['a', 'low', 'high'], {
      entryPageId: 'a',
      connections: [{ id: 'fallback', sourcePageId: 'a', targetPageId: 'low', isDefault: true }],
      resultRanges: [
        { id: 'low-range', label: 'Low', resultKey: 'low', sourcePageId: 'a', targetPageId: 'low', minScore: 0, maxScore: 9 },
        { id: 'high-range', label: 'High', resultKey: 'high', sourcePageId: 'a', targetPageId: 'high', minScore: 10, maxScore: 20 },
      ],
    }, [question])

    const decision = resolveFunnelDecision(document, 'a', { answers: { qualified: 'yes' } })
    expect(decision).toMatchObject({
      kind: 'result',
      targetPageId: 'high',
      resultRangeId: 'high-range',
      resultKey: 'high',
      score: 15,
    })

    expect(simulateFunnelPath(document, { answers: { qualified: 'yes' } })).toMatchObject({
      path: ['a', 'high'],
      score: 15,
      resultKey: 'high',
      stopReason: 'terminal',
    })
  })
})

describe('explicit page actions in simulation', () => {
  it('follows a valid go_to_page button selected by page slug', () => {
    const button = makeElement('button', 'button', 'a', {
      action: 'go_to_page',
      target: 'page-c',
    })
    const document = makeDocument(['a', 'b', 'c'], undefined, [button])

    expect(simulateFunnelPath(document, { actions: { 'page-a': 'page-c' } })).toMatchObject({
      path: ['a', 'c'],
      stopReason: 'terminal',
      decisions: expect.arrayContaining([
        expect.objectContaining({ kind: 'action', targetPageId: 'c' }),
      ]),
    })
  })
})

describe('flow validation', () => {
  it('accepts a reachable branching graph with one default route', () => {
    const document = makeDocument(['a', 'b', 'c'], {
      entryPageId: 'a',
      connections: [
        {
          id: 'branch',
          sourcePageId: 'a',
          targetPageId: 'b',
          condition: {
            operator: 'and',
            conditions: [{ id: 'condition', source: 'answer', key: 'choice', operator: 'equals', value: 'b' }],
          },
        },
        { id: 'default', sourcePageId: 'a', targetPageId: 'c', isDefault: true },
      ],
    }, [
      makeElement('choice', 'short_text', 'a', { fieldKey: 'choice' }),
      makeElement('submit-b', 'button', 'b', { action: 'submit' }),
      makeElement('submit-c', 'cta', 'c', { action: 'submit' }),
    ])

    expect(validateFunnelFlow(document)).toMatchObject({
      valid: true,
      entryPageId: 'a',
      reachablePageIds: expect.arrayContaining(['a', 'b', 'c']),
      terminalPageIds: expect.arrayContaining(['b', 'c']),
      issues: [],
    })
  })

  it('rejects a branch without a default route', () => {
    const document = makeDocument(['a', 'b'], {
      connections: [{
        id: 'branch',
        sourcePageId: 'a',
        targetPageId: 'b',
        condition: {
          operator: 'and',
          conditions: [{ id: 'condition', source: 'answer', key: 'choice', operator: 'equals', value: 'b' }],
        },
      }],
    })

    const result = validateFunnelFlow(document)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_default', pageId: 'a' }),
    ]))
  })

  it('rejects multiple default routes from the same page', () => {
    const document = makeDocument(['a', 'b', 'c'], {
      connections: [
        { id: 'default-b', sourcePageId: 'a', targetPageId: 'b', isDefault: true },
        { id: 'default-c', sourcePageId: 'a', targetPageId: 'c', isDefault: true },
      ],
    })

    const result = validateFunnelFlow(document)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'multiple_defaults', pageId: 'a' }),
    ]))
  })

  it('identifies unreachable pages', () => {
    const document = makeDocument(['a', 'b', 'orphan'], {
      connections: [{ id: 'a-b', sourcePageId: 'a', targetPageId: 'b', isDefault: true }],
    })

    const result = validateFunnelFlow(document)
    expect(result.reachablePageIds).toEqual(['a', 'b'])
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unreachable_page', pageId: 'orphan' }),
    ]))
  })

  it('detects a reachable cycle with no terminal or submit exit', () => {
    const document = makeDocument(['a', 'b'], {
      connections: [
        { id: 'a-b', sourcePageId: 'a', targetPageId: 'b', isDefault: true },
        { id: 'b-a', sourcePageId: 'b', targetPageId: 'a', isDefault: true },
      ],
    })

    const result = validateFunnelFlow(document)
    expect(result.valid).toBe(false)
    expect(result.terminalPageIds).toEqual([])
    expect(result.issues.filter((issue) => issue.code === 'cycle_without_exit').map((issue) => issue.pageId))
      .toEqual(expect.arrayContaining(['a', 'b']))
    expect(simulateFunnelPath(document).stopReason).toBe('cycle')
  })

  it('rejects overlapping result ranges', () => {
    const document = makeDocument(['a', 'low', 'high'], {
      connections: [{ id: 'fallback', sourcePageId: 'a', targetPageId: 'low', isDefault: true }],
      resultRanges: [
        { id: 'low-range', label: 'Low', sourcePageId: 'a', targetPageId: 'low', minScore: 0, maxScore: 10 },
        { id: 'high-range', label: 'High', sourcePageId: 'a', targetPageId: 'high', minScore: 10, maxScore: 20 },
      ],
    })

    const result = validateFunnelFlow(document)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'overlapping_result_range', pageId: 'a', resultRangeId: 'high-range' }),
    ]))
  })

  it('rejects a result range whose source page only has a submit button', () => {
    // resultRanges are only consulted from the 'next_page' branch of
    // handleAction at runtime (funnel-player.tsx) — a page whose only
    // visible button uses action:'submit' would never actually route
    // through this range in production. See scripts/funnel-doc-validator.ts
    // for the equivalent check applied to CLI-built templates.
    const document = makeDocument(['a', 'low'], {
      resultRanges: [
        { id: 'low-range', label: 'Low', sourcePageId: 'a', targetPageId: 'low', minScore: 0, maxScore: 10 },
      ],
    }, [
      makeElement('submit', 'button', 'a', { action: 'submit' }),
    ])

    const result = validateFunnelFlow(document)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unreachable_result_range', pageId: 'a', resultRangeId: 'low-range' }),
    ]))
  })

  it('accepts a result range whose source page has a next_page button alongside a submit button', () => {
    const document = makeDocument(['a', 'low'], {
      resultRanges: [
        { id: 'low-range', label: 'Low', sourcePageId: 'a', targetPageId: 'low', minScore: 0, maxScore: 10 },
      ],
    }, [
      makeElement('advance', 'button', 'a', { action: 'next_page' }),
    ])

    const result = validateFunnelFlow(document)
    expect(result.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unreachable_result_range' }),
    ]))
  })

  it('rejects a go-to-page action without a destination', () => {
    const button = makeElement('button', 'button', 'a', {
      action: 'go_to_page',
      target: '',
    })
    const document = makeDocument(['a', 'b'], undefined, [button])

    const result = validateFunnelFlow(document)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_action_target',
        pageId: 'a',
        elementId: 'button',
      }),
    ]))
  })

  it('accepts a conditional submit on a non-terminal page without treating it as a terminal', () => {
    const conditionalSubmit = makeElement('conditional-submit', 'cta', 'a', { action: 'submit' }, {
      visibility: {
        operator: 'and',
        conditions: [{ id: 'show-submit', variable: 'answer.choice', operator: 'equals', value: 'finish' }],
      },
    })
    const document = makeDocument(['a', 'b'], {
      connections: [{ id: 'a-b', sourcePageId: 'a', targetPageId: 'b', isDefault: true }],
    }, [
      makeElement('choice', 'short_text', 'a', { fieldKey: 'choice' }),
      conditionalSubmit,
      makeElement('submit-b', 'button', 'b', { action: 'submit' }),
    ])

    expect(validateFunnelFlow(document).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_terminal_action', pageId: 'a' }),
    ]))
  })

  it('rejects unsupported UTM keys, answer aliases as flow variables, and reserved response keys', () => {
    const document = makeDocument(['a'], {
      scoringRules: [{
        id: 'bad-variable',
        points: 1,
        condition: {
          operator: 'and',
          conditions: [
            { id: 'alias', source: 'variable', key: 'answer.choice', operator: 'equals', value: 'x' },
            { id: 'utm', source: 'utm', key: 'utm_affiliate', operator: 'equals', value: 'partner' },
          ],
        },
      }],
    }, [
      makeElement('choice', 'short_text', 'a', { fieldKey: 'system.score' }),
      makeElement('submit', 'button', 'a', { action: 'submit' }),
    ])

    const issues = validateFunnelFlow(document).issues
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_key_contract' }),
      expect.objectContaining({ code: 'missing_reference' }),
    ]))
  })

  it('rejects a quiz scoring rule that points to a removed option', () => {
    const quiz = makeElement('quiz', 'quiz_choice', 'a', {
      fieldKey: 'choice',
      options: ['Sim', 'Nao'],
    }, { scoring: [{ id: 'orphan', value: 'Talvez', points: 5 }] })
    const document = makeDocument(['a'], undefined, [
      quiz,
      makeElement('submit', 'button', 'a', { action: 'submit' }),
    ])

    expect(validateFunnelFlow(document).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_score_rule', elementId: 'quiz' }),
    ]))
  })
})
