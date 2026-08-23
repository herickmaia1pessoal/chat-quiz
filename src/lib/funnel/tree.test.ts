import { describe, expect, it } from 'vitest'

import {
  canMoveElementToPage,
  canNestElement,
  duplicateElement,
  ensureUniqueFieldKeys,
  getChildren,
  isDescendant,
  moveElement,
  moveElementToPage,
  normalizeElementDropIndex,
} from './tree'
import {
  FUNNEL_SCHEMA_VERSION,
  type ElementType,
  type FunnelDocument,
  type FunnelElement,
  type FunnelPage,
} from './types'

function makePage(id: string, order: number): FunnelPage {
  return { id, name: `Page ${id}`, slug: `page-${id}`, order, settings: {} }
}

function makeElement(
  id: string,
  type: ElementType,
  pageId: string,
  parentId: string | null,
  order: number,
  content: Record<string, unknown> = {},
): FunnelElement {
  return {
    id,
    type,
    pageId,
    parentId,
    slot: 'default',
    order,
    content,
    styles: { desktop: {} },
    logic: {},
  }
}

function makeDocument(elements: FunnelElement[]): FunnelDocument {
  return {
    schemaVersion: FUNNEL_SCHEMA_VERSION,
    funnelId: 'funnel-test',
    title: 'Test funnel',
    slug: 'test-funnel',
    settings: {},
    pages: [makePage('page-a', 0), makePage('page-b', 1)],
    elements,
    variables: [],
  }
}

function hierarchicalElements() {
  return [
    makeElement('section-a', 'section', 'page-a', null, 0),
    makeElement('container-a', 'container', 'page-a', 'section-a', 0),
    makeElement('nested-container', 'container', 'page-a', 'container-a', 0),
    makeElement('field-a', 'email', 'page-a', 'nested-container', 0, { fieldKey: 'email' }),
    makeElement('heading-a', 'heading', 'page-a', 'container-a', 1),
    makeElement('container-sibling', 'container', 'page-a', 'section-a', 1),
    makeElement('section-b', 'section', 'page-b', null, 0),
    makeElement('container-b', 'container', 'page-b', 'section-b', 0),
  ]
}

describe('funnel hierarchy', () => {
  it('returns ordered direct children and detects descendants at any depth', () => {
    const elements = hierarchicalElements()

    expect(getChildren(elements, 'page-a', 'container-a').map((element) => element.id))
      .toEqual(['nested-container', 'heading-a'])
    expect(isDescendant(elements, 'container-a', 'field-a')).toBe(true)
    expect(isDescendant(elements, 'nested-container', 'heading-a')).toBe(false)
  })

  it('enforces the registry parent contract', () => {
    const [section, container] = hierarchicalElements()

    expect(canNestElement('section', null)).toBe(true)
    expect(canNestElement('section', container)).toBe(false)
    expect(canNestElement('container', null)).toBe(false)
    expect(canNestElement('container', section)).toBe(true)
    expect(canNestElement('heading', container)).toBe(true)
    expect(canNestElement('heading', null)).toBe(false)
  })

  it('prevents moving an element under itself or one of its descendants', () => {
    const document = makeDocument(hierarchicalElements())

    expect(moveElement(document, 'container-a', 'container-a')).toBe(document)
    expect(moveElement(document, 'container-a', 'nested-container')).toBe(document)
  })

  it('moves a complete branch between pages and attaches it to a compatible parent', () => {
    const document = makeDocument(hierarchicalElements())

    expect(canMoveElementToPage(document, 'container-a', 'page-b')).toBe(true)
    const moved = moveElementToPage(document, 'container-a', 'page-b')
    const branchIds = ['container-a', 'nested-container', 'field-a', 'heading-a']

    expect(moved.elements.filter((element) => branchIds.includes(element.id)))
      .toEqual(expect.arrayContaining(branchIds.map((id) => expect.objectContaining({ id, pageId: 'page-b' }))))
    expect(moved.elements.find((element) => element.id === 'container-a')?.parentId).toBe('section-b')
    expect(moved.elements.find((element) => element.id === 'nested-container')?.parentId).toBe('container-a')
    expect(moved.elements.find((element) => element.id === 'field-a')?.parentId).toBe('nested-container')
    expect(moved.elements.find((element) => element.id === 'container-sibling')?.pageId).toBe('page-a')
  })

  it('reorders siblings and normalizes their order without changing the branch', () => {
    const document = makeDocument(hierarchicalElements())
    const reordered = moveElement(document, 'container-sibling', 'section-a', 0)

    expect(getChildren(reordered.elements, 'page-a', 'section-a').map((element) => [element.id, element.order]))
      .toEqual([
        ['container-sibling', 0],
        ['container-a', 1],
      ])
    expect(reordered.elements.find((element) => element.id === 'field-a')).toMatchObject({
      pageId: 'page-a',
      parentId: 'nested-container',
    })
  })

  it('normalizes a downward drop index after removing the source sibling', () => {
    expect(normalizeElementDropIndex(0, 2, true)).toBe(1)
    expect(normalizeElementDropIndex(2, 0, true)).toBe(0)
    expect(normalizeElementDropIndex(0, 2, false)).toBe(2)
  })
})

describe('stable response field keys', () => {
  it('normalizes and de-duplicates keys against existing elements and the same batch', () => {
    const existing = [makeElement('existing', 'email', 'page-a', null, 0, { fieldKey: 'email' })]
    const inputs = [
      makeElement('name-1', 'short_text', 'page-a', null, 0, { fieldKey: 'nome completo' }),
      makeElement('name-2', 'short_text', 'page-a', null, 1, { fieldKey: 'nome completo' }),
      makeElement('email-2', 'email', 'page-a', null, 2, { fieldKey: 'email' }),
      makeElement('heading', 'heading', 'page-a', null, 3, { text: 'No response key' }),
    ]

    const result = ensureUniqueFieldKeys(inputs, existing)

    expect(result.map((element) => element.content.fieldKey)).toEqual([
      'nome_completo',
      'nome_completo_2',
      'email_2',
      undefined,
    ])
    expect(inputs[0].content.fieldKey).toBe('nome completo')
  })

  it('de-duplicates keys case-insensitively and replaces reserved namespaces', () => {
    const existing = [makeElement('existing', 'email', 'page-a', null, 0, { fieldKey: 'email' })]
    const result = ensureUniqueFieldKeys([
      makeElement('email-upper', 'email', 'page-a', null, 0, { fieldKey: 'Email' }),
      makeElement('reserved', 'number', 'page-a', null, 1, { fieldKey: 'system.score' }),
    ], existing)

    expect(result.map((element) => element.content.fieldKey)).toEqual(['Email_2', 'resposta'])
  })

  it('assigns new IDs and unique keys when duplicating a nested branch', () => {
    const document = makeDocument(hierarchicalElements())
    const duplicated = duplicateElement(document, 'nested-container')

    expect(duplicated.selectedId).not.toBeNull()
    expect(duplicated.selectedId).not.toBe('nested-container')

    const copiedRoot = duplicated.document.elements.find((element) => element.id === duplicated.selectedId)
    const copiedField = duplicated.document.elements.find((element) => (
      element.parentId === copiedRoot?.id && element.type === 'email'
    ))
    expect(copiedRoot).toMatchObject({ parentId: 'container-a', order: 1 })
    expect(copiedField).toMatchObject({
      pageId: 'page-a',
      content: expect.objectContaining({ fieldKey: 'email_2' }),
    })
    expect(duplicated.document.elements.find((element) => element.id === 'field-a')?.content.fieldKey)
      .toBe('email')
  })
})
