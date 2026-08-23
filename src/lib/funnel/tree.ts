import { ELEMENT_REGISTRY } from './registry'
import { funnelKeyIdentity, safeResponseFieldBase } from './keys'
import type { FunnelDocument, FunnelElement, FunnelPage, ElementType } from './types'

export function createFunnelId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  throw new Error('crypto.randomUUID() não está disponível neste ambiente')
}

export function getPageElements(document: FunnelDocument, pageId: string) {
  return document.elements
    .filter((element) => element.pageId === pageId)
    .sort((a, b) => a.order - b.order)
}

export function getChildren(
  elements: FunnelElement[],
  pageId: string,
  parentId: string | null,
) {
  return elements
    .filter((element) => element.pageId === pageId && element.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

/**
 * Drop zones are indexed against the sibling list before the moving element
 * is removed. Moving down in the same group therefore shifts the destination
 * one position to the left after removal.
 */
export function normalizeElementDropIndex(
  sourceIndex: number,
  targetIndex: number,
  sameSiblingGroup: boolean,
) {
  return sameSiblingGroup && sourceIndex >= 0 && sourceIndex < targetIndex
    ? targetIndex - 1
    : targetIndex
}

export function isDescendant(elements: FunnelElement[], parentId: string, candidateId: string) {
  let cursor = elements.find((element) => element.id === candidateId)
  while (cursor?.parentId) {
    if (cursor.parentId === parentId) return true
    cursor = elements.find((element) => element.id === cursor?.parentId)
  }
  return false
}

export function canNestElement(type: ElementType, parent: FunnelElement | null) {
  const allowedParents = ELEMENT_REGISTRY[type].allowedParents
  return parent === null ? allowedParents.length === 0 : allowedParents.includes(parent.type)
}

function normalizeSiblingOrders(elements: FunnelElement[]) {
  const groups = new Map<string, FunnelElement[]>()
  for (const element of elements) {
    const key = `${element.pageId}:${element.parentId ?? 'root'}:${element.slot}`
    const group = groups.get(key) ?? []
    group.push(element)
    groups.set(key, group)
  }
  const orders = new Map<string, number>()
  for (const group of groups.values()) {
    group.sort((a, b) => a.order - b.order).forEach((element, index) => orders.set(element.id, index))
  }
  return elements.map((element) => ({ ...element, order: orders.get(element.id) ?? element.order }))
}

function responseKey(element: FunnelElement) {
  return typeof element.content.fieldKey === 'string' && element.content.fieldKey.trim()
    ? element.content.fieldKey.trim()
    : null
}

function nextUniqueFieldKey(base: string, used: Set<string>) {
  const sanitized = base.trim().replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[^A-Za-z]+/, '').replace(/^_+|_+$/g, '')
  const normalized = safeResponseFieldBase(sanitized)
  if (!used.has(funnelKeyIdentity(normalized))) return normalized
  let suffix = 2
  while (used.has(funnelKeyIdentity(`${normalized}_${suffix}`))) suffix += 1
  return `${normalized}_${suffix}`
}

export function ensureUniqueFieldKeys(
  elements: FunnelElement[],
  existingElements: FunnelElement[] = [],
) {
  const used = new Set(existingElements
    .map(responseKey)
    .filter((key): key is string => Boolean(key))
    .map(funnelKeyIdentity))
  return elements.map((element) => {
    const currentKey = responseKey(element)
    if (!currentKey) return element
    const fieldKey = nextUniqueFieldKey(currentKey, used)
    used.add(funnelKeyIdentity(fieldKey))
    return fieldKey === currentKey
      ? element
      : { ...element, content: { ...element.content, fieldKey } }
  })
}

function replaceFieldToken(value: unknown, keyMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    let next = value
    for (const [previousKey, nextKey] of keyMap) {
      const escaped = previousKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      next = next
        .replace(new RegExp(`\\{\\{\\s*answer\\.${escaped}\\s*\\}\\}`, 'g'), `{{answer.${nextKey}}}`)
        .replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g'), `{{${nextKey}}}`)
    }
    return next
  }
  if (Array.isArray(value)) return value.map((item) => replaceFieldToken(item, keyMap))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceFieldToken(item, keyMap)]))
  }
  return value
}

export function remapElementFieldReferences(elements: FunnelElement[], keyMap: Map<string, string>) {
  if (!keyMap.size) return elements
  return elements.map((element) => ({
    ...element,
    content: replaceFieldToken(element.content, keyMap) as Record<string, unknown>,
    logic: {
      ...element.logic,
      visibility: element.logic.visibility ? {
        ...element.logic.visibility,
        conditions: element.logic.visibility.conditions.map((condition) => {
          const direct = keyMap.get(condition.variable)
          const answerKey = condition.variable.startsWith('answer.')
            ? keyMap.get(condition.variable.slice('answer.'.length))
            : undefined
          return direct
            ? { ...condition, variable: direct }
            : answerKey ? { ...condition, variable: `answer.${answerKey}` } : condition
        }),
      } : undefined,
      actions: element.logic.actions?.map((action) => ({
        ...action,
        target: typeof action.target === 'string'
          ? replaceFieldToken(action.target, keyMap) as string
          : action.target,
      })),
    },
  }))
}

export function createElement(
  type: ElementType,
  pageId: string,
  parentId: string | null,
  order = 0,
  existingElements: FunnelElement[] = [],
): FunnelElement {
  const definition = ELEMENT_REGISTRY[type]
  const element: FunnelElement = {
    id: createFunnelId(),
    type,
    pageId,
    parentId,
    slot: 'default',
    order,
    content: structuredClone(definition.defaultContent),
    styles: { desktop: { ...definition.defaultStyles } },
    logic: {},
  }
  return ensureUniqueFieldKeys([element], existingElements)[0]
}

export function insertElement(
  document: FunnelDocument,
  element: FunnelElement,
  index?: number,
): FunnelDocument {
  const siblings = getChildren(document.elements, element.pageId, element.parentId)
  const insertionIndex = Math.max(0, Math.min(index ?? siblings.length, siblings.length))
  const siblingIds = siblings.map((item) => item.id)
  siblingIds.splice(insertionIndex, 0, element.id)
  const orderById = new Map(siblingIds.map((id, order) => [id, order]))
  return {
    ...document,
    elements: normalizeSiblingOrders([
      ...document.elements.map((item) => orderById.has(item.id) ? { ...item, order: orderById.get(item.id)! } : item),
      { ...element, order: insertionIndex },
    ]),
  }
}

export function moveElement(
  document: FunnelDocument,
  elementId: string,
  parentId: string | null,
  index?: number,
  targetPageId?: string,
): FunnelDocument {
  const moving = document.elements.find((element) => element.id === elementId)
  if (!moving || moving.id === parentId) return document
  if (parentId && isDescendant(document.elements, moving.id, parentId)) return document
  const parent = parentId ? document.elements.find((element) => element.id === parentId) ?? null : null
  if (!canNestElement(moving.type, parent)) return document

  const pageId = parent?.pageId ?? targetPageId ?? moving.pageId
  if (!document.pages.some((page) => page.id === pageId)) return document
  if (parent && parent.pageId !== pageId) return document
  const siblings = getChildren(document.elements, pageId, parentId).filter((item) => item.id !== elementId)
  const insertionIndex = Math.max(0, Math.min(index ?? siblings.length, siblings.length))
  const siblingIds = siblings.map((item) => item.id)
  siblingIds.splice(insertionIndex, 0, elementId)
  const orderById = new Map(siblingIds.map((id, order) => [id, order]))

  return {
    ...document,
    elements: normalizeSiblingOrders(document.elements.map((element) => {
      const isMovingBranch = element.id === moving.id || isDescendant(document.elements, moving.id, element.id)
      if (element.id === moving.id) {
        return { ...element, pageId, parentId, order: insertionIndex }
      }
      if (isMovingBranch) return { ...element, pageId }
      if (orderById.has(element.id)) return { ...element, order: orderById.get(element.id)! }
      return element
    })),
  }
}

function compatibleParentForPage(
  document: FunnelDocument,
  element: FunnelElement,
  targetPageId: string,
) {
  if (canNestElement(element.type, null)) return null

  const allowedParents = ELEMENT_REGISTRY[element.type].allowedParents
  return getPageElements(document, targetPageId)
    .filter((candidate) => allowedParents.includes(candidate.type))
    .sort((left, right) => {
      // Content belongs in a container when one exists. A container, on the
      // other hand, should land in the destination section before nesting in
      // another container. This keeps the visual hierarchy predictable.
      const preferredType = element.type === 'container' ? 'section' : 'container'
      const leftPriority = left.type === preferredType ? 0 : 1
      const rightPriority = right.type === preferredType ? 0 : 1
      return leftPriority - rightPriority || left.order - right.order
    })[0] ?? undefined
}

export function canMoveElementToPage(
  document: FunnelDocument,
  elementId: string,
  targetPageId: string,
) {
  const moving = document.elements.find((element) => element.id === elementId)
  if (!moving || !document.pages.some((page) => page.id === targetPageId)) return false
  return canNestElement(moving.type, null) || Boolean(compatibleParentForPage(document, moving, targetPageId))
}

/**
 * Moves an element and its complete descendant branch to another page. The
 * branch keeps its internal parent references; only its root is attached to a
 * compatible destination parent.
 */
export function moveElementToPage(
  document: FunnelDocument,
  elementId: string,
  targetPageId: string,
): FunnelDocument {
  const moving = document.elements.find((element) => element.id === elementId)
  if (!moving || moving.pageId === targetPageId) return document

  const parent = compatibleParentForPage(document, moving, targetPageId)
  if (!canNestElement(moving.type, parent ?? null)) return document
  return moveElement(document, elementId, parent?.id ?? null, undefined, targetPageId)
}

export function removeElement(document: FunnelDocument, elementId: string): FunnelDocument {
  const removedIds = new Set<string>([elementId])
  let changed = true
  while (changed) {
    changed = false
    for (const element of document.elements) {
      if (element.parentId && removedIds.has(element.parentId) && !removedIds.has(element.id)) {
        removedIds.add(element.id)
        changed = true
      }
    }
  }
  return {
    ...document,
    elements: normalizeSiblingOrders(document.elements.filter((element) => !removedIds.has(element.id))),
  }
}

export function duplicateElement(document: FunnelDocument, elementId: string) {
  const original = document.elements.find((element) => element.id === elementId)
  if (!original) return { document, selectedId: null as string | null }
  const branch = document.elements.filter(
    (element) => element.id === elementId || isDescendant(document.elements, elementId, element.id),
  )
  const idMap = new Map(branch.map((element) => [element.id, createFunnelId()]))
  const rawCopies = branch.map((element) => ({
    ...structuredClone(element),
    id: idMap.get(element.id)!,
    parentId: element.parentId && idMap.has(element.parentId)
      ? idMap.get(element.parentId)!
      : element.parentId,
    order: element.id === original.id ? original.order + 1 : element.order,
  }))
  const copiesWithKeys = ensureUniqueFieldKeys(rawCopies, document.elements)
  const keyMap = new Map<string, string>()
  branch.forEach((element, index) => {
    const previousKey = responseKey(element)
    const nextKey = responseKey(copiesWithKeys[index])
    if (previousKey && nextKey && previousKey !== nextKey) keyMap.set(previousKey, nextKey)
  })
  const copies = remapElementFieldReferences(copiesWithKeys, keyMap)
  const shifted = document.elements.map((element) => (
    element.pageId === original.pageId &&
    element.parentId === original.parentId &&
    element.order > original.order
  ) ? { ...element, order: element.order + 1 } : element)
  return {
    document: { ...document, elements: normalizeSiblingOrders([...shifted, ...copies]) },
    selectedId: idMap.get(elementId)!,
  }
}

export function createPage(name: string, order: number): FunnelPage {
  const id = createFunnelId()
  return {
    id,
    name,
    slug: `pagina-${order + 1}`,
    order,
    settings: {},
  }
}

export function reorderPage(
  document: FunnelDocument,
  pageId: string,
  targetIndex: number,
): FunnelDocument {
  const pages = [...document.pages].sort((left, right) => left.order - right.order)
  const currentIndex = pages.findIndex((page) => page.id === pageId)
  if (currentIndex < 0) return document

  const nextIndex = Math.max(0, Math.min(targetIndex, pages.length - 1))
  if (nextIndex === currentIndex) return document
  const [moving] = pages.splice(currentIndex, 1)
  pages.splice(nextIndex, 0, moving)

  return {
    ...document,
    pages: pages.map((page, order) => ({ ...page, order })),
  }
}

export function removePage(document: FunnelDocument, pageId: string): FunnelDocument {
  if (document.pages.length <= 1) return document
  return {
    ...document,
    pages: document.pages
      .filter((page) => page.id !== pageId)
      .sort((a, b) => a.order - b.order)
      .map((page, order) => ({ ...page, order })),
    elements: document.elements.filter((element) => element.pageId !== pageId),
  }
}
