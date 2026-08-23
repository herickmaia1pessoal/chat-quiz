'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Eye,
  FileStack,
  GitBranch,
  Grid3X3,
  Layers3,
  Loader2,
  Monitor,
  PanelLeft,
  Redo2,
  Rocket,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  UsersRound,
  Variable,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ELEMENT_REGISTRY,
  canNestElement,
  createElement,
  createFunnelId,
  createPage,
  duplicateElement,
  ensureUniqueFieldKeys,
  funnelKeyIdentity,
  getChildren,
  insertElement,
  moveElement,
  moveElementToPage,
  normalizeElementDropIndex,
  normalizeFunnelOptions,
  removeElement,
  removePage,
  remapElementFieldReferences,
  safeCustomVariableBase,
  reorderPage,
  type Breakpoint,
  type ElementType,
  type FlowConditionGroup,
  type FunnelDocument,
  type FunnelElement,
  type FunnelFlowDefinition,
  type FunnelPage,
  type FunnelVariable,
  type PublishFunnelInput,
  type PublishFunnelResult,
  type SaveDraftInput,
  type SaveDraftResult,
} from '@/lib/funnel'
import { FunnelPlayer } from '@/components/funnel-runtime/funnel-player'
import { getFunnelFlowDefinition, validateFunnelFlow } from '@/lib/funnel/flow'
import { useUnsavedChangesGuard } from '@/lib/use-unsaved-changes-guard'
import { ElementView } from './element-view'
import { FlowView } from './flow-view'
import { Inspector } from './inspector'
import {
  FUNNEL_ELEMENT_MIME,
  FUNNEL_INSTANCE_MIME,
  SidePanel,
  type LeftPanel,
} from './side-panel'

type BuilderMode = 'design' | 'flow'

interface HistoryState {
  past: FunnelDocument[]
  present: FunnelDocument
  future: FunnelDocument[]
}

export interface FunnelBuilderProps {
  initialDocument: FunnelDocument
  initialRevision?: number
  initialMode?: BuilderMode
  initialPublished?: boolean
  // Used only by the Inspector's media-library picker, to know which
  // Storage prefix (`${workspaceId}/${funnelId}`) to browse. Undefined
  // simply hides the "Escolher da Biblioteca" button — manual URL entry
  // still works either way.
  workspaceId?: string
  onSaveDraft?: (input: SaveDraftInput) => Promise<SaveDraftResult>
  onPublish?: (input: PublishFunnelInput) => Promise<PublishFunnelResult>
}

function useDocumentHistory(initialDocument: FunnelDocument) {
  const [state, setState] = useState<HistoryState>({ past: [], present: initialDocument, future: [] })

  const commit = useCallback((updater: (document: FunnelDocument) => FunnelDocument) => {
    setState((current) => {
      const next = updater(current.present)
      if (next === current.present) return current
      return {
        past: [...current.past.slice(-79), current.present],
        present: next,
        future: [],
      }
    })
  }, [])

  const replace = useCallback((document: FunnelDocument) => {
    setState({ past: [], present: document, future: [] })
  }, [])

  const undo = useCallback(() => {
    setState((current) => {
      const previous = current.past.at(-1)
      if (!previous) return current
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((current) => {
      const next = current.future[0]
      if (!next) return current
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      }
    })
  }, [])

  return {
    document: state.present,
    commit,
    replace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
}

function canvasWidth(breakpoint: Breakpoint) {
  if (breakpoint === 'mobile') return 390
  if (breakpoint === 'tablet') return 768
  return 1180
}

function normalizePageSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeVariableKey(value: string) {
  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/^_+|_+$/g, '')
  return key || 'variavel'
}

function nextAvailableKey(keys: string[], requested: string) {
  const identities = new Set(keys.map(funnelKeyIdentity))
  if (!identities.has(funnelKeyIdentity(requested))) return requested
  let suffix = 2
  while (identities.has(funnelKeyIdentity(`${requested}_${suffix}`))) suffix += 1
  return `${requested}_${suffix}`
}

function nextAvailableSlug(slugs: string[], requested: string) {
  if (!slugs.includes(requested)) return requested
  let suffix = 2
  while (slugs.includes(`${requested}-${suffix}`)) suffix += 1
  return `${requested}-${suffix}`
}

function replaceVariableToken(value: unknown, previousKey: string, nextKey: string): unknown {
  if (typeof value === 'string') {
    const escaped = previousKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return value.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g'), `{{${nextKey}}}`)
  }
  if (Array.isArray(value)) return value.map((item) => replaceVariableToken(item, previousKey, nextKey))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceVariableToken(item, previousKey, nextKey)]))
  }
  return value
}

function renameFlowVariable(flow: FunnelFlowDefinition | undefined, previousKey: string, nextKey: string) {
  if (!flow) return flow
  const renameGroup = (group: FlowConditionGroup) => ({
    ...group,
    conditions: group.conditions.map((condition) => condition.source === 'variable' && condition.key === previousKey ? { ...condition, key: nextKey } : condition),
  })
  return {
    ...flow,
    connections: flow.connections?.map((connection) => ({ ...connection, condition: connection.condition ? renameGroup(connection.condition) : undefined })),
    scoringRules: flow.scoringRules?.map((rule) => ({ ...rule, condition: renameGroup(rule.condition) })),
  }
}

function renameVariableReferences(document: FunnelDocument, previousKey: string, nextKey: string) {
  const flow = renameFlowVariable(document.flow, previousKey, nextKey)
  const settingsFlow = document.settings.flow && typeof document.settings.flow === 'object' && !Array.isArray(document.settings.flow)
    ? renameFlowVariable(document.settings.flow as FunnelFlowDefinition, previousKey, nextKey)
    : document.settings.flow
  return {
    ...document,
    flow,
    settings: { ...document.settings, flow: settingsFlow },
    elements: document.elements.map((element) => ({
      ...element,
      content: replaceVariableToken(element.content, previousKey, nextKey) as Record<string, unknown>,
      logic: {
        ...element.logic,
        visibility: element.logic.visibility ? {
          ...element.logic.visibility,
          conditions: element.logic.visibility.conditions.map((condition) => condition.variable === previousKey ? { ...condition, variable: nextKey } : condition),
        } : undefined,
      },
    })),
  }
}

function renameAnswerReferences(document: FunnelDocument, previousKey: string, nextKey: string) {
  const previousVariableKey = `answer.${previousKey}`
  const nextVariableKey = `answer.${nextKey}`
  const renameGroup = (group: FlowConditionGroup) => ({
    ...group,
    conditions: group.conditions.map((condition) => {
      if (condition.source === 'answer' && condition.key === previousKey) return { ...condition, key: nextKey }
      if (condition.source === 'variable' && condition.key === previousVariableKey) return { ...condition, key: nextVariableKey }
      return condition
    }),
  })
  const renameFlow = (flow: FunnelFlowDefinition | undefined) => flow ? ({
    ...flow,
    connections: flow.connections?.map((connection) => ({
      ...connection,
      condition: connection.condition ? renameGroup(connection.condition) : undefined,
    })),
    scoringRules: flow.scoringRules?.map((rule) => ({ ...rule, condition: renameGroup(rule.condition) })),
  }) : flow
  const flow = renameFlow(document.flow)
  const settingsFlow = document.settings.flow && typeof document.settings.flow === 'object' && !Array.isArray(document.settings.flow)
    ? renameFlow(document.settings.flow as FunnelFlowDefinition)
    : document.settings.flow
  return {
    ...document,
    flow,
    settings: { ...document.settings, flow: settingsFlow },
    elements: document.elements.map((element) => ({
      ...element,
      content: replaceVariableToken(
        replaceVariableToken(element.content, previousVariableKey, nextVariableKey),
        previousKey,
        nextKey,
      ) as Record<string, unknown>,
      logic: {
        ...element.logic,
        visibility: element.logic.visibility ? {
          ...element.logic.visibility,
          conditions: element.logic.visibility.conditions.map((condition) => {
            if (condition.variable === previousKey) return { ...condition, variable: nextKey }
            if (condition.variable === previousVariableKey) return { ...condition, variable: nextVariableKey }
            return condition
          }),
        } : undefined,
        actions: element.logic.actions?.map((action) => ({
          ...action,
          target: typeof action.target === 'string'
            ? replaceVariableToken(
                replaceVariableToken(action.target, previousVariableKey, nextVariableKey),
                previousKey,
                nextKey,
              ) as string
            : action.target,
        })),
      },
    })),
  }
}

function DropZone({
  parent,
  pageId,
  index,
  onAdd,
  onMove,
}: {
  parent: FunnelElement | null
  pageId: string
  index: number
  onAdd: (type: ElementType, parentId: string | null, index: number) => void
  onMove: (id: string, parentId: string | null, index: number, fromDrop?: boolean) => void
}) {
  const [active, setActive] = useState(false)
  return (
    <div
      onDragEnter={(event) => { event.preventDefault(); setActive(true) }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(FUNNEL_ELEMENT_MIME) ? 'copy' : 'move' }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setActive(false)
        const type = event.dataTransfer.getData(FUNNEL_ELEMENT_MIME) as ElementType
        const instanceId = event.dataTransfer.getData(FUNNEL_INSTANCE_MIME)
        if (type && ELEMENT_REGISTRY[type] && canNestElement(type, parent)) onAdd(type, parent?.id ?? null, index)
        else if (instanceId) onMove(instanceId, parent?.id ?? null, index, true)
      }}
      data-page-id={pageId}
      className={`relative z-20 -my-0.5 h-1.5 w-full shrink-0 transition-all ${active ? 'my-2 h-10 rounded-xl border border-dashed border-violet-400 bg-violet-500/10' : ''}`}
    >
      {active && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-violet-200">Soltar aqui</span>}
    </div>
  )
}

function CanvasNode({
  element,
  document,
  breakpoint,
  selectedId,
  onSelect,
  onAdd,
  onMove,
  onDuplicate,
  onDelete,
}: {
  element: FunnelElement
  document: FunnelDocument
  breakpoint: Breakpoint
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (type: ElementType, parentId: string | null, index: number) => void
  onMove: (id: string, parentId: string | null, index: number, fromDrop?: boolean) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const selected = selectedId === element.id
  const children = getChildren(document.elements, element.pageId, element.id)
  const canContain = element.type === 'section' || element.type === 'container'
  const definition = ELEMENT_REGISTRY[element.type]

  const nested = canContain ? (
    <>
      {children.map((child, index) => (
        <div key={child.id} className="contents">
          <DropZone parent={element} pageId={element.pageId} index={index} onAdd={onAdd} onMove={onMove} />
          <CanvasNode element={child} document={document} breakpoint={breakpoint} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} onMove={onMove} onDuplicate={onDuplicate} onDelete={onDelete} />
        </div>
      ))}
      <DropZone parent={element} pageId={element.pageId} index={children.length} onAdd={onAdd} onMove={onMove} />
      {!children.length && (
        <div className="flex min-h-20 w-full items-center justify-center rounded-xl border border-dashed border-white/10 text-[10px] font-medium text-zinc-700">Arraste elementos para este {definition.label.toLowerCase()}</div>
      )}
    </>
  ) : undefined

  return (
    <div
      draggable
      data-element-id={element.id}
      onDragStart={(event) => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(FUNNEL_INSTANCE_MIME, element.id)
      }}
      onClick={(event) => { event.stopPropagation(); onSelect(element.id) }}
      className={`group/element relative min-w-0 rounded-[inherit] outline outline-1 outline-offset-2 transition ${selected ? 'z-10 outline-violet-400' : 'outline-transparent hover:outline-violet-400/35'}`}
    >
      {selected && (
        <div className="absolute -top-7 left-0 z-40 flex h-6 items-center overflow-hidden rounded-md border border-violet-400/30 bg-violet-500 text-[9px] font-bold text-white shadow-xl shadow-black/30">
          <span className="px-2">{definition.label}</span>
          <button type="button" onClick={(event) => { event.stopPropagation(); onDuplicate(element.id) }} className="flex h-full items-center border-l border-white/20 px-1.5 hover:bg-white/15" title="Duplicar"><Copy className="size-3" /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(element.id) }} className="flex h-full items-center border-l border-white/20 px-1.5 hover:bg-red-500" title="Excluir"><Trash2 className="size-3" /></button>
        </div>
      )}
      <ElementView element={element} breakpoint={breakpoint}>{nested}</ElementView>
    </div>
  )
}

export function FunnelBuilder({
  initialDocument,
  initialRevision = 0,
  initialMode = 'design',
  initialPublished = false,
  workspaceId,
  onSaveDraft,
  onPublish,
}: FunnelBuilderProps) {
  const { document, commit, replace, undo, redo, canUndo, canRedo } = useDocumentHistory(initialDocument)
  const [revision, setRevision] = useState(initialRevision)
  const [activePageId, setActivePageId] = useState(initialDocument.pages[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('components')
  const [mode, setMode] = useState<BuilderMode>(initialMode)
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop')
  const [zoom, setZoom] = useState(0.87)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [published, setPublished] = useState(initialPublished)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // The editor's own panels (Etapas/Paleta/Preview/Propriedades) assume a
  // desktop-class pointer and width — the same reasoning that already gates
  // the properties column behind `xl:flex` elsewhere in this file. Below
  // that breakpoint we swap the whole editor for a read-only preview
  // screen instead of trying to squeeze drag-and-drop panels into a phone.
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const copiedId = useRef<string | null>(null)
  const hydrated = useRef(false)
  const changeSequence = useRef(0)
  const requestInFlight = useRef(false)
  const activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0]
  const resolvedActivePageId = activePage?.id ?? ''
  const selectedElement = document.elements.find((element) => element.id === selectedId) ?? null
  const width = canvasWidth(breakpoint)
  const flowValidation = useMemo(() => validateFunnelFlow(document), [document])

  useEffect(() => {
    const resolvedPageId = document.pages.some((page) => page.id === activePageId)
      ? activePageId
      : flowValidation.entryPageId ?? document.pages[0]?.id ?? ''
    const selectionIsValid = selectedId === null || document.elements.some((element) => (
      element.id === selectedId && element.pageId === resolvedPageId
    ))
    if (resolvedPageId === activePageId && selectionIsValid) return
    const frame = window.requestAnimationFrame(() => {
      if (resolvedPageId !== activePageId) setActivePageId(resolvedPageId)
      if (!selectionIsValid) setSelectedId(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activePageId, document.elements, document.pages, flowValidation.entryPageId, selectedId])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    setIsMobileViewport(query.matches)
    const handleChange = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  const mutate = useCallback((updater: (current: FunnelDocument) => FunnelDocument) => {
    commit(updater)
    changeSequence.current += 1
    setDirty(true)
    setPublished(false)
  }, [commit])

  useEffect(() => {
    if (hydrated.current || onSaveDraft) return
    hydrated.current = true
    try {
      const raw = localStorage.getItem(`funnelforge:draft:${initialDocument.funnelId}`)
      if (!raw) return
      const cached = JSON.parse(raw) as FunnelDocument
      if (cached.schemaVersion === 2 && cached.funnelId === initialDocument.funnelId) {
        const frame = window.requestAnimationFrame(() => {
          replace(cached)
          setActivePageId(cached.pages[0]?.id ?? '')
          setDirty(true)
          setPublished(false)
          setNotice('Rascunho local restaurado')
        })
        return () => window.cancelAnimationFrame(frame)
      }
    } catch {
      localStorage.removeItem(`funnelforge:draft:${initialDocument.funnelId}`)
    }
  }, [initialDocument.funnelId, onSaveDraft, replace])

  useUnsavedChangesGuard(dirty, 'Existem altera\u00e7\u00f5es n\u00e3o salvas. Deseja sair do editor mesmo assim?')

  const saveDraft = useCallback(async () => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    const savedSequence = changeSequence.current
    setSaving(true)
    setNotice(null)
    try {
      if (onSaveDraft) {
        const result = await onSaveDraft({ funnelId: document.funnelId, expectedRevision: revision, document, label: 'Salvamento manual' })
        if (!result.ok) {
          setNotice(result.conflict ? 'Conflito: atualize antes de salvar' : result.error || 'Não foi possível salvar')
          return
        }
        if (typeof result.revision === 'number') setRevision(result.revision)
      } else {
        localStorage.setItem(`funnelforge:draft:${document.funnelId}`, JSON.stringify(document))
      }
      const hasNewerChanges = changeSequence.current !== savedSequence
      if (!hasNewerChanges) setDirty(false)
      setPublished(false)
      setNotice(hasNewerChanges ? 'Versão salva; há alterações mais recentes no editor' : 'Rascunho salvo')
    } catch {
      setNotice('Falha ao salvar o rascunho')
    } finally {
      requestInFlight.current = false
      setSaving(false)
    }
  }, [document, onSaveDraft, revision])

  const publish = useCallback(async () => {
    if (requestInFlight.current) return
    const validation = validateFunnelFlow(document)
    if (!validation.valid) {
      setMode('flow')
      setNotice(`Publicação bloqueada: ${validation.issues[0]?.message ?? 'corrija o fluxo'}`)
      return
    }
    requestInFlight.current = true
    const publishedSequence = changeSequence.current
    setSaving(true)
    setNotice(null)
    try {
      if (onPublish) {
        const result = await onPublish({ funnelId: document.funnelId, expectedRevision: revision, document })
        if (!result.ok) {
          setNotice(result.conflict ? 'Conflito: salve a versão mais recente' : result.error || 'Não foi possível publicar')
          return
        }
        if (typeof result.revision === 'number') setRevision(result.revision)
      } else {
        localStorage.setItem(`funnelforge:published:${document.funnelId}`, JSON.stringify(document))
      }
      const hasNewerChanges = changeSequence.current !== publishedSequence
      if (!hasNewerChanges) setDirty(false)
      setPublished(!hasNewerChanges)
      setNotice(hasNewerChanges ? 'Funil publicado; há alterações mais recentes no rascunho' : 'Funil publicado')
    } catch {
      setNotice('Falha ao publicar o funil')
    } finally {
      requestInFlight.current = false
      setSaving(false)
    }
  }, [document, onPublish, revision])

  const addAt = useCallback((type: ElementType, parentId: string | null, index: number) => {
    mutate((current) => insertElement(current, createElement(type, resolvedActivePageId, parentId, index, current.elements), index))
  }, [mutate, resolvedActivePageId])

  const addElement = useCallback((type: ElementType) => {
    let nextSelectedId: string | null = null
    mutate((current) => {
      const selected = current.elements.find((element) => element.id === selectedId && element.pageId === activePageId) ?? null
      const selectedParent = selected?.parentId ? current.elements.find((element) => element.id === selected.parentId) ?? null : null
      let parent: FunnelElement | null = null

      if (type !== 'section') {
        if (selected && canNestElement(type, selected)) parent = selected
        else if (selectedParent && canNestElement(type, selectedParent)) parent = selectedParent
        else {
          const containers = current.elements.filter((element) => element.pageId === resolvedActivePageId && element.type === 'container')
          const sections = current.elements.filter((element) => element.pageId === resolvedActivePageId && element.type === 'section')
          parent = containers[0] ?? sections[0] ?? null
        }
      }

      let working = current
      if (type !== 'section' && !parent) {
        const section = createElement('section', resolvedActivePageId, null)
        const container = createElement('container', resolvedActivePageId, section.id)
        working = insertElement(insertElement(working, section), container)
        parent = container
      }
      if (!canNestElement(type, parent)) return current
      const created = createElement(type, resolvedActivePageId, parent?.id ?? null, 0, working.elements)
      nextSelectedId = created.id
      return insertElement(working, created)
    })
    if (nextSelectedId) setSelectedId(nextSelectedId)
  }, [mutate, resolvedActivePageId, selectedId])

  const move = useCallback((id: string, parentId: string | null, index?: number, fromDrop = false) => {
    mutate((current) => {
      let targetIndex = index
      if (fromDrop && index !== undefined) {
        const moving = current.elements.find((element) => element.id === id)
        const targetPageId = parentId
          ? current.elements.find((element) => element.id === parentId)?.pageId
          : resolvedActivePageId
        if (moving && targetPageId === moving.pageId && moving.parentId === parentId) {
          const sourceIndex = getChildren(current.elements, moving.pageId, moving.parentId).findIndex((element) => element.id === id)
          targetIndex = normalizeElementDropIndex(sourceIndex, index, true)
        }
      }
      return moveElement(current, id, parentId, targetIndex)
    })
    setSelectedId(id)
  }, [mutate, resolvedActivePageId])

  const moveToPage = useCallback((id: string, pageId: string) => {
    mutate((current) => moveElementToPage(current, id, pageId))
    setActivePageId(pageId)
    setSelectedId(id)
  }, [mutate])

  const remove = useCallback((id: string) => {
    mutate((current) => removeElement(current, id))
    if (selectedId === id) setSelectedId(null)
  }, [mutate, selectedId])

  const updateSelectedElement = useCallback((updater: (element: FunnelElement) => FunnelElement) => {
    if (!selectedId) return
    mutate((current) => {
      const original = current.elements.find((element) => element.id === selectedId)
      if (!original) return current
      let updated = updater(original)
      const previousVisibility = original.logic.visibility
      const nextVisibility = updated.logic.visibility
      if (previousVisibility
          && previousVisibility.conditions.length > 1
          && nextVisibility?.conditions.length === 1
          && nextVisibility.conditions[0]?.id === previousVisibility.conditions[0]?.id) {
        updated = {
          ...updated,
          logic: {
            ...updated.logic,
            visibility: {
              ...nextVisibility,
              conditions: [nextVisibility.conditions[0], ...previousVisibility.conditions.slice(1)],
            },
          },
        }
      }
      if (original.type === 'quiz_choice' && updated.type === 'quiz_choice') {
        const previousOptions = normalizeFunnelOptions(original.content.options).map((option) => option.value)
        const nextOptions = normalizeFunnelOptions(updated.content.options).map((option) => option.value)
        if (JSON.stringify(previousOptions) !== JSON.stringify(nextOptions)) {
          updated = {
            ...updated,
            logic: {
              ...updated.logic,
              scoring: (updated.logic.scoring ?? []).flatMap((rule) => {
                const optionIndex = previousOptions.findIndex((option) => String(rule.value) === option)
                if (optionIndex < 0) return [rule]
                const nextOption = nextOptions[optionIndex]
                return nextOption === undefined ? [] : [{ ...rule, value: nextOption }]
              }),
            },
          }
        }
      }
      const previousKey = typeof original.content.fieldKey === 'string' ? original.content.fieldKey.trim() : ''
      const nextKey = typeof updated.content.fieldKey === 'string' ? updated.content.fieldKey.trim() : ''
      const base = previousKey && nextKey && previousKey !== nextKey
        ? renameAnswerReferences(current, previousKey, nextKey)
        : current
      return {
        ...base,
        elements: base.elements.map((element) => element.id === selectedId ? updated : element),
      }
    })
  }, [mutate, selectedId])

  const duplicate = useCallback((id: string) => {
    let nextSelected: string | null = null
    mutate((current) => {
      const result = duplicateElement(current, id)
      nextSelected = result.selectedId
      return result.document
    })
    if (nextSelected) setSelectedId(nextSelected)
  }, [mutate])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); void saveDraft(); return }
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); changeSequence.current += 1; setDirty(true); setPublished(false); return }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); changeSequence.current += 1; setDirty(true); setPublished(false); return }
      if (modifier && event.key.toLowerCase() === 'd' && selectedId) { event.preventDefault(); duplicate(selectedId); return }
      if (modifier && event.key.toLowerCase() === 'c' && selectedId) { event.preventDefault(); copiedId.current = selectedId; setNotice('Elemento copiado'); return }
      if (modifier && event.key.toLowerCase() === 'v' && copiedId.current) { event.preventDefault(); duplicate(copiedId.current); return }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); remove(selectedId) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [duplicate, redo, remove, saveDraft, selectedId, undo])

  const addPage = () => {
    const page = createPage(`Página ${document.pages.length + 1}`, document.pages.length)
    const section = createElement('section', page.id, null)
    const container = createElement('container', page.id, section.id)
    mutate((current) => ({ ...current, pages: [...current.pages, page], elements: [...current.elements, section, container] }))
    setActivePageId(page.id)
    setSelectedId(container.id)
  }

  const duplicatePage = (pageId: string) => {
    const source = document.pages.find((page) => page.id === pageId)
    if (!source) return
    const newPageId = createFunnelId()
    const branch = document.elements.filter((element) => element.pageId === pageId)
    const idMap = new Map(branch.map((element) => [element.id, createFunnelId()]))
    const page = { ...structuredClone(source), id: newPageId, name: `${source.name} — cópia`, slug: nextAvailableSlug(document.pages.map((item) => item.slug), `${source.slug}-copia`), order: document.pages.length }
    const elementsWithKeys = ensureUniqueFieldKeys(branch.map((element) => ({ ...structuredClone(element), id: idMap.get(element.id)!, pageId: newPageId, parentId: element.parentId ? idMap.get(element.parentId) ?? null : null })), document.elements)
    const keyMap = new Map<string, string>()
    branch.forEach((element, index) => {
      const previousKey = typeof element.content.fieldKey === 'string' ? element.content.fieldKey.trim() : ''
      const nextKey = typeof elementsWithKeys[index]?.content.fieldKey === 'string' ? elementsWithKeys[index].content.fieldKey.trim() : ''
      if (previousKey && nextKey && previousKey !== nextKey) keyMap.set(previousKey, nextKey)
    })
    const elements = remapElementFieldReferences(elementsWithKeys, keyMap)
    mutate((current) => ({ ...current, pages: [...current.pages, page], elements: [...current.elements, ...elements] }))
    setActivePageId(newPageId)
    setSelectedId(null)
  }

  const updatePage = useCallback((pageId: string, patch: Partial<Pick<FunnelPage, 'name' | 'slug'>>) => {
    mutate((current) => {
      const page = current.pages.find((item) => item.id === pageId)
      if (!page) return current
      const nextPatch = { ...patch }
      if (patch.slug !== undefined) {
        const normalized = normalizePageSlug(patch.slug)
        if (!normalized) return current
        nextPatch.slug = nextAvailableSlug(current.pages.filter((item) => item.id !== pageId).map((item) => item.slug), normalized)
      }
      return { ...current, pages: current.pages.map((item) => item.id === pageId ? { ...item, ...nextPatch } : item) }
    })
  }, [mutate])

  const changePageOrder = useCallback((pageId: string, targetIndex: number) => {
    mutate((current) => reorderPage(current, pageId, targetIndex))
  }, [mutate])

  const deletePage = (pageId: string) => {
    if (document.pages.length <= 1) { setNotice('O funil precisa ter ao menos uma página'); return }
    if (pageId === activePageId) {
      setActivePageId(document.pages.find((page) => page.id !== pageId)?.id ?? '')
      setSelectedId(null)
    }
    mutate((current) => {
      const next = removePage(current, pageId)
      const flow = getFunnelFlowDefinition(current)
      if (!flow) return next
      const nextFlow = {
        ...flow,
        entryPageId: flow.entryPageId === pageId ? next.pages[0]?.id : flow.entryPageId,
        connections: flow.connections?.filter((connection) => connection.sourcePageId !== pageId && connection.targetPageId !== pageId),
        resultRanges: flow.resultRanges?.filter((range) => range.sourcePageId !== pageId && range.targetPageId !== pageId),
      }
      return { ...next, flow: nextFlow, settings: { ...next.settings, flow: nextFlow } }
    })
  }

  const addVariable = useCallback((draft: Pick<FunnelVariable, 'key' | 'label' | 'value'>) => {
    mutate((current) => {
      const normalized = safeCustomVariableBase(normalizeVariableKey(draft.key))
      const responseKeys = current.elements.flatMap((element) => (
        typeof element.content.fieldKey === 'string' ? [element.content.fieldKey.trim()] : []
      ))
      const key = nextAvailableKey([...current.variables.map((variable) => variable.key), ...responseKeys], normalized)
      return { ...current, variables: [...current.variables, { id: createFunnelId(), key, label: draft.label?.trim() || key, kind: 'custom', value: draft.value ?? '' }] }
    })
  }, [mutate])

  const updateVariable = useCallback((id: string, patch: Partial<Pick<FunnelVariable, 'key' | 'label' | 'value'>>) => {
    mutate((current) => {
      const variable = current.variables.find((item) => item.id === id)
      if (!variable || variable.kind !== 'custom') return current

      let nextDocument = current
      let nextKey = variable.key
      if (patch.key !== undefined) {
        const responseKeys = current.elements.flatMap((element) => (
          typeof element.content.fieldKey === 'string' ? [element.content.fieldKey.trim()] : []
        ))
        nextKey = nextAvailableKey(
          [...current.variables.filter((item) => item.id !== id).map((item) => item.key), ...responseKeys],
          safeCustomVariableBase(normalizeVariableKey(patch.key)),
        )
        if (nextKey !== variable.key) nextDocument = renameVariableReferences(current, variable.key, nextKey)
      }

      return {
        ...nextDocument,
        variables: nextDocument.variables.map((item) => item.id === id ? { ...item, ...patch, key: nextKey } : item),
      }
    })
  }, [mutate])

  const deleteVariable = useCallback((id: string) => {
    mutate((current) => {
      const variable = current.variables.find((item) => item.id === id)
      return variable?.kind === 'custom'
        ? { ...current, variables: current.variables.filter((item) => item.id !== id) }
        : current
    })
  }, [mutate])

  const roots = activePage ? getChildren(document.elements, activePage.id, null) : []
  const railItems: Array<{ id: LeftPanel; label: string; icon: typeof PanelLeft }> = [
    { id: 'components', label: 'Componentes', icon: Grid3X3 },
    { id: 'pages', label: 'Páginas', icon: FileStack },
    { id: 'layers', label: 'Camadas', icon: Layers3 },
    { id: 'variables', label: 'Variáveis', icon: Variable },
  ]

  if (isMobileViewport) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#050507] font-sans text-zinc-100">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#09090d] px-3">
          <Link href="/dashboard" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-white" aria-label="Voltar ao dashboard"><ArrowLeft className="size-4" /></Link>
          <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-tight text-zinc-100">{document.title}</p>
        </header>

        {previewOpen ? (
          <>
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0a0a0e] px-3">
              <span className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Eye className="size-3.5 text-violet-400" /> Preview</span>
              <button type="button" onClick={() => setPreviewOpen(false)} className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[10px] text-zinc-300 hover:bg-white/5"><X className="size-3.5" /> Fechar</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <FunnelPlayer key={`${document.funnelId}:mobile-preview`} document={document} preview forcedBreakpoint="mobile" initialPageId={activePage?.id} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-500/10 text-violet-300"><Monitor className="size-6" /></span>
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-zinc-100">Edição disponível no computador</p>
              <p className="max-w-xs text-xs leading-relaxed text-zinc-500">
                O editor de funis usa arrastar-e-soltar e vários painéis lado a lado — funciona melhor numa tela maior. Aqui no celular você pode visualizar como o funil está.
              </p>
            </div>
            <button type="button" onClick={() => setPreviewOpen(true)} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 text-xs font-bold text-white shadow-lg shadow-violet-500/15">
              <Eye className="size-4" /> Visualizar funil
            </button>
            <div className="flex flex-col gap-2 pt-2 text-xs">
              <Link href={`/dashboard/funnels/${document.funnelId}/leads`} className="text-zinc-500 underline underline-offset-4 hover:text-zinc-300">Ver leads</Link>
              <Link href={`/dashboard/funnels/${document.funnelId}/analytics`} className="text-zinc-500 underline underline-offset-4 hover:text-zinc-300">Ver analytics</Link>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-[600px] flex-col overflow-hidden bg-[#050507] font-sans text-zinc-100">
      <header className="flex h-12 shrink-0 items-center border-b border-white/[0.08] bg-[#09090d] px-2 shadow-xl shadow-black/20">
        <div className="flex min-w-0 items-center gap-1 border-r border-white/[0.07] pr-2 lg:w-[280px]">
          <Link href="/dashboard" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-white" aria-label="Voltar ao dashboard"><ArrowLeft className="size-4" /></Link>
          <div className="hidden size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20 sm:flex"><Sparkles className="size-3.5 text-white" /></div>
          <div className="min-w-0 px-1"><p className="truncate text-xs font-bold uppercase tracking-tight text-zinc-100">{document.title}</p></div>
          <span className={`ml-auto hidden items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold sm:flex ${dirty ? 'border-amber-400/15 bg-amber-400/[0.06] text-amber-400' : 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400'}`}><span className={`size-1.5 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />{dirty ? 'Não salvo' : published ? 'Publicado' : 'Salvo'}</span>
        </div>

        <div className="flex items-center gap-0.5 px-2">
          <button type="button" disabled={!canUndo} onClick={() => { undo(); changeSequence.current += 1; setDirty(true); setPublished(false) }} className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white disabled:opacity-25" title="Desfazer (Ctrl+Z)"><Undo2 className="size-3.5" /></button>
          <button type="button" disabled={!canRedo} onClick={() => { redo(); changeSequence.current += 1; setDirty(true); setPublished(false) }} className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white disabled:opacity-25" title="Refazer"><Redo2 className="size-3.5" /></button>
          <button type="button" disabled={!selectedId} onClick={() => selectedId && duplicate(selectedId)} className="hidden rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white disabled:opacity-25 md:block" title="Duplicar"><Copy className="size-3.5" /></button>
          <button type="button" disabled={!selectedId} onClick={() => selectedId && remove(selectedId)} className="hidden rounded-md p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-25 md:block" title="Excluir"><Trash2 className="size-3.5" /></button>
        </div>

        <div className="mx-auto hidden items-center gap-2 xl:flex">
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-black/20 p-0.5">
            {([{ id: 'desktop', icon: Monitor }, { id: 'tablet', icon: Tablet }, { id: 'mobile', icon: Smartphone }] as const).map(({ id, icon: Icon }) => (
              <button type="button" key={id} onClick={() => setBreakpoint(id)} className={`flex size-7 items-center justify-center rounded-md transition ${breakpoint === id ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-600 hover:text-zinc-300'}`} title={id}><Icon className="size-3.5" /></button>
            ))}
          </div>
          <div className="flex h-8 items-center rounded-lg border border-white/[0.08] bg-black/20">
            <button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .1))} className="px-2 text-zinc-600 hover:text-white"><ZoomOut className="size-3.5" /></button>
            <span className="w-10 text-center font-mono text-[10px] text-zinc-500">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.2, value + .1))} className="px-2 text-zinc-600 hover:text-white"><ZoomIn className="size-3.5" /></button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden items-center rounded-lg border border-white/[0.08] bg-black/20 p-0.5 lg:flex">
            <button type="button" onClick={() => setMode('design')} className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition ${mode === 'design' ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-600 hover:text-zinc-300'}`}><Grid3X3 className="size-3" /> Design</button>
            <button type="button" onClick={() => setMode('flow')} className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition ${mode === 'flow' ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-600 hover:text-zinc-300'}`}><GitBranch className="size-3" /> Fluxo</button>
          </div>
          <div className="hidden items-center gap-0.5 xl:flex">
            <Link href={`/dashboard/funnels/${document.funnelId}/leads`} title="Leads" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-white"><UsersRound className="size-3.5" /><span className="hidden 2xl:inline">Leads</span></Link>
            <Link href={`/dashboard/funnels/${document.funnelId}/analytics`} title="Analytics" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-white"><BarChart3 className="size-3.5" /><span className="hidden 2xl:inline">Analytics</span></Link>
            <Link href={`/dashboard/funnels/${document.funnelId}/settings`} title="Configuracoes" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-zinc-500 transition hover:bg-white/5 hover:text-white"><Settings2 className="size-3.5" /><span className="hidden 2xl:inline">Config.</span></Link>
          </div>
          <button type="button" onClick={() => setPreviewOpen(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-white"><Eye className="size-3.5" /><span className="hidden sm:inline">Preview</span></button>
          <button type="button" disabled={saving} onClick={() => void saveDraft()} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}<span className="hidden sm:inline">Salvar</span></button>
          <button type="button" disabled={saving} onClick={() => void publish()} title={flowValidation.valid ? 'Publicar funil' : flowValidation.issues[0]?.message} className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[10px] font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50 ${flowValidation.valid ? 'bg-gradient-to-r from-violet-500 to-indigo-500 shadow-violet-500/15' : 'bg-amber-600 shadow-amber-900/20'}`}><Rocket className="size-3.5" /> Publicar</button>
        </div>
      </header>

      {notice && (
        <button type="button" onClick={() => setNotice(null)} className="absolute right-4 top-16 z-[80] flex max-w-[min(420px,calc(100vw-2rem))] items-start gap-2 rounded-xl border border-white/10 bg-[#17171d] px-4 py-3 text-left text-xs text-zinc-200 shadow-2xl shadow-black/60"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /><span className="min-w-0">{notice}</span><X className="ml-2 size-3 shrink-0 text-zinc-600" /></button>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-white/[0.07] bg-[#08080c] py-2">
          {railItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setLeftPanel(id)} className={`flex size-8 items-center justify-center rounded-lg transition ${leftPanel === id ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-600 hover:bg-white/5 hover:text-zinc-300'}`} title={label}><Icon className="size-4" /></button>)}
          <div className="mt-auto"><button type="button" onClick={() => setMode(mode === 'design' ? 'flow' : 'design')} className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/5 hover:text-zinc-300" title="Alternar Design/Fluxo">{mode === 'design' ? <GitBranch className="size-4" /> : <Grid3X3 className="size-4" />}</button></div>
        </nav>

        <div className="hidden lg:flex">
          <SidePanel
            panel={leftPanel}
            document={document}
            activePageId={activePage?.id ?? ''}
            selectedId={selectedId}
            onAddElement={addElement}
            onSelectPage={(id) => { setActivePageId(id); setSelectedId(null) }}
            onAddPage={addPage}
            onDuplicatePage={duplicatePage}
            onDeletePage={deletePage}
            onUpdatePage={updatePage}
            onReorderPage={changePageOrder}
            onSelectElement={setSelectedId}
            onMoveElement={move}
            onMoveElementToPage={moveToPage}
            onAddVariable={addVariable}
            onUpdateVariable={updateVariable}
            onDeleteVariable={deleteVariable}
          />
        </div>

        <main className="relative min-w-0 flex-1 overflow-auto bg-[#07070a] [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]" onClick={() => setSelectedId(null)}>
          <div className="pointer-events-none sticky left-0 top-0 z-30 flex h-8 items-center justify-between border-b border-white/[0.055] bg-[#09090d]/90 px-4 backdrop-blur">
            <span className="text-[9px] font-semibold text-zinc-600">{activePage?.name ?? 'Página'}</span>
            <span className="font-mono text-[9px] text-zinc-700">{breakpoint} · {width}px</span>
          </div>
          <div className={`min-h-[calc(100%-2rem)] bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:36px_36px] px-14 py-12 ${mode === 'flow' ? 'min-w-0' : 'min-w-max'}`}>
            {mode === 'flow' ? (
              <FlowView document={document} activePageId={activePage?.id ?? ''} onSelectPage={(id) => { setActivePageId(id); setSelectedId(null) }} onChange={mutate} />
            ) : (
              <div className="mx-auto" style={{ width: width * zoom }}>
                <div
                  className="relative min-h-[720px] overflow-visible rounded-2xl border border-white/[0.09] bg-[#09090b] shadow-[0_30px_100px_rgba(0,0,0,.55)] transition-[width,transform] duration-300"
                  style={{ width, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropZone parent={null} pageId={activePage?.id ?? ''} index={0} onAdd={addAt} onMove={move} />
                  {roots.map((element, index) => (
                    <div key={element.id}>
                      {index > 0 && <DropZone parent={null} pageId={element.pageId} index={index} onAdd={addAt} onMove={move} />}
                      <CanvasNode element={element} document={document} breakpoint={breakpoint} selectedId={selectedId} onSelect={setSelectedId} onAdd={addAt} onMove={move} onDuplicate={duplicate} onDelete={remove} />
                    </div>
                  ))}
                  <DropZone parent={null} pageId={activePage?.id ?? ''} index={roots.length} onAdd={addAt} onMove={move} />
                  {!roots.length && <div className="absolute inset-8 flex items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-zinc-700">Arraste uma Seção para começar</div>}
                </div>
              </div>
            )}
          </div>
        </main>

        <div className="hidden xl:flex"><Inspector element={selectedElement} breakpoint={breakpoint} pages={document.pages} onChange={updateSelectedElement} onClose={() => setSelectedId(null)} workspaceId={workspaceId} funnelId={document.funnelId} /></div>
      </div>

      {selectedElement && (
        <div
          role="dialog"
          aria-label={`Ajustar ${ELEMENT_REGISTRY[selectedElement.type].label}`}
          className="fixed bottom-7 right-2 top-[52px] z-[70] flex w-[min(292px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0e] shadow-2xl shadow-black/70 xl:hidden"
        >
          <div className="flex h-10 shrink-0 items-center justify-center gap-1 border-b border-white/[0.07]">
            {([{ id: 'desktop', icon: Monitor, label: 'Desktop' }, { id: 'tablet', icon: Tablet, label: 'Tablet' }, { id: 'mobile', icon: Smartphone, label: 'Celular' }] as const).map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" title={label} aria-label={`Editar ${label}`} aria-pressed={breakpoint === id} onClick={() => setBreakpoint(id)} className={`grid size-8 place-items-center rounded-lg ${breakpoint === id ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-600 hover:bg-white/5 hover:text-zinc-300'}`}><Icon className="size-4" /></button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <Inspector
              element={selectedElement}
              breakpoint={breakpoint}
              pages={document.pages}
              onChange={updateSelectedElement}
              onClose={() => setSelectedId(null)}
              workspaceId={workspaceId}
              funnelId={document.funnelId}
            />
          </div>
        </div>
      )}

      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#09090d] px-3 text-[8px] text-zinc-600">
        <span>{document.pages.length} páginas · {document.elements.length} elementos · revisão {revision}</span>
        <span className="hidden sm:inline">Ctrl+S salvar · Ctrl+D duplicar · Del excluir</span>
      </footer>

      {previewOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#050507]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#0a0a0e] px-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300"><Eye className="size-4 text-violet-400" /> Preview · {activePage?.name}</div>
            <div className="flex items-center gap-1">
              {([{ id: 'desktop', icon: Monitor }, { id: 'tablet', icon: Tablet }, { id: 'mobile', icon: Smartphone }] as const).map(({ id, icon: Icon }) => <button type="button" key={id} onClick={() => setBreakpoint(id)} className={`flex size-8 items-center justify-center rounded-lg ${breakpoint === id ? 'bg-violet-500/15 text-violet-300' : 'text-zinc-600'}`}><Icon className="size-4" /></button>)}
              <button type="button" onClick={() => setPreviewOpen(false)} className="ml-3 flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/5"><X className="size-3.5" /> Fechar</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <div className="mx-auto min-h-full overflow-hidden rounded-xl border border-white/10 bg-[#09090b] shadow-2xl shadow-black" style={{ width: Math.min(width, typeof window !== 'undefined' ? window.innerWidth - 48 : width) }}>
              <FunnelPlayer key={`${document.funnelId}:${activePage?.id ?? flowValidation.entryPageId ?? 'default'}`} document={document} preview forcedBreakpoint={breakpoint} initialPageId={activePage?.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
