'use client'

import { useMemo, useState } from 'react'
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  AudioLines,
  BadgeCheck,
  BadgeHelp,
  BadgePercent,
  BetweenVerticalStart,
  Blocks,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Columns3,
  Copy,
  CreditCard,
  Hash,
  Heading1,
  Image,
  LayoutGrid,
  ListChecks,
  ListCollapse,
  ListFilter,
  Mail,
  Megaphone,
  Minus,
  MousePointerClick,
  PanelsTopLeft,
  Phone,
  Plus,
  Quote,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TextCursorInput,
  Trash2,
  Upload,
  UsersRound,
  Video,
  type LucideIcon,
} from 'lucide-react'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  ELEMENT_DEFINITIONS,
  ELEMENT_REGISTRY,
  canMoveElementToPage,
  getChildren,
  type ElementType,
  type FunnelDocument,
  type FunnelElement,
  type FunnelPage,
  type FunnelVariable,
} from '@/lib/funnel'

export type LeftPanel = 'components' | 'pages' | 'layers' | 'variables'

export const FUNNEL_ELEMENT_MIME = 'application/x-funnelforge-element'
export const FUNNEL_INSTANCE_MIME = 'application/x-funnelforge-instance'

const iconMap: Record<string, LucideIcon> = {
  PanelsTopLeft,
  Columns3,
  BetweenVerticalStart,
  Minus,
  Heading1,
  AlignLeft,
  Image,
  Video,
  MousePointerClick,
  Sparkles,
  Code2,
  AudioLines,
  TextCursorInput,
  Mail,
  Phone,
  Hash,
  CalendarDays,
  ListFilter,
  ListChecks,
  CircleDot,
  Upload,
  LayoutGrid,
  SlidersHorizontal,
  Star,
  ChartNoAxesColumnIncreasing,
  Clock3,
  ListCollapse,
  BadgePercent,
  CreditCard,
  Quote,
  BadgeHelp,
  BadgeCheck,
  Megaphone,
  UsersRound,
  Blocks,
}

function PanelHeader({ title, onCollapse }: { title: string; onCollapse?: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
      {onCollapse && <button type="button" onClick={onCollapse} className="rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground"><ChevronRight className="size-3.5" /></button>}
    </div>
  )
}

function ComponentsPanel({ onAdd }: { onAdd: (type: ElementType) => void }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return query
      ? ELEMENT_DEFINITIONS.filter((item) => `${item.label} ${item.description}`.toLocaleLowerCase('pt-BR').includes(query))
      : ELEMENT_DEFINITIONS
  }, [search])

  return (
    <>
      <PanelHeader title="Componentes" />
      <div className="p-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-muted-foreground/60 focus-within:border-violet-500/40">
          <Search className="size-3.5" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar componente" className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
        {CATEGORY_ORDER.map((category) => {
          const items = filtered.filter((item) => item.category === category)
          if (!items.length) return null
          return (
            <section key={category} className="pt-3">
              <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">{CATEGORY_LABELS[category]}</h3>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                  const Icon = iconMap[item.icon] ?? Sparkles
                  return (
                    <button
                      type="button"
                      draggable
                      key={item.type}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copy'
                        event.dataTransfer.setData(FUNNEL_ELEMENT_MIME, item.type)
                      }}
                      onClick={() => onAdd(item.type)}
                      title={item.description}
                      className="group relative min-h-[92px] rounded-xl border border-border bg-muted/20 p-2.5 text-left transition hover:-translate-y-0.5 hover:border-violet-400/35 hover:bg-violet-500/[0.055]"
                    >
                      {!item.implementedInV1 && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-amber-400" title="Próxima etapa" />}
                      <span className="mb-2 flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-violet-500/10 group-hover:text-violet-600"><Icon className="size-3.5" /></span>
                      <span className="block text-[11px] font-semibold text-foreground">{item.label}</span>
                      <span className="mt-1 block text-[9px] leading-tight text-muted-foreground/60">{item.description}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

function PagesPanel({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onUpdate,
  onReorder,
}: {
  pages: FunnelPage[]
  activePageId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: Partial<Pick<FunnelPage, 'name' | 'slug'>>) => void
  onReorder: (id: string, targetIndex: number) => void
}) {
  const orderedPages = [...pages].sort((a, b) => a.order - b.order)
  const activePage = orderedPages.find((page) => page.id === activePageId)

  return (
    <>
      <PanelHeader title={`Páginas · ${pages.length}`} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
        {activePage && (
          <div className="mb-3 space-y-2 rounded-xl border border-violet-300/40 bg-violet-500/[0.055] p-3">
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Nome</span>
              <input
                value={activePage.name}
                onChange={(event) => onUpdate(activePage.id, { name: event.target.value })}
                onBlur={() => !activePage.name.trim() && onUpdate(activePage.id, { name: 'Página sem nome' })}
                className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] text-foreground outline-none focus:border-violet-400/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Slug interno</span>
              <span className="flex h-8 items-center rounded-lg border border-border bg-muted/40 px-2.5 focus-within:border-violet-400/40">
                <span className="text-[11px] text-muted-foreground/60">/</span>
                <input
                  value={activePage.slug}
                  onChange={(event) => onUpdate(activePage.id, { slug: event.target.value })}
                  onBlur={() => !activePage.slug.trim() && onUpdate(activePage.id, { slug: `pagina-${activePage.order + 1}` })}
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none"
                />
              </span>
            </label>
          </div>
        )}
        <div className="space-y-2">
          {orderedPages.map((page, index) => (
            <div key={page.id} className={`group flex items-center gap-2 rounded-xl border p-2 transition ${activePageId === page.id ? 'border-violet-400/35 bg-violet-500/10' : 'border-border bg-muted/20 hover:bg-accent'}`}>
              <button type="button" onClick={() => onSelect(page.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${activePageId === page.id ? 'bg-violet-500 text-white' : 'bg-muted text-muted-foreground/60'}`}>{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{page.name || 'Página sem nome'}</span><span className="block truncate text-[9px] text-muted-foreground/60">/{page.slug || 'sem-slug'}</span></span>
              </button>
              <span className="flex shrink-0 items-center gap-0.5 opacity-40 transition group-focus-within:opacity-100 group-hover:opacity-100">
                <button type="button" disabled={index === 0} onClick={() => onReorder(page.id, index - 1)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20" aria-label={`Mover ${page.name} para cima`}><ArrowUp className="size-3" /></button>
                <button type="button" disabled={index === orderedPages.length - 1} onClick={() => onReorder(page.id, index + 1)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20" aria-label={`Mover ${page.name} para baixo`}><ArrowDown className="size-3" /></button>
                <button type="button" onClick={() => onDuplicate(page.id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Duplicar ${page.name}`}><Copy className="size-3" /></button>
                <button type="button" disabled={orderedPages.length <= 1} onClick={() => onDelete(page.id)} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-20" aria-label={`Excluir ${page.name}`}><Trash2 className="size-3" /></button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" onClick={onAdd} className="mt-3 flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-[11px] font-semibold text-muted-foreground transition hover:border-violet-300/40 hover:text-violet-600"><Plus className="size-3.5" /> Nova página</button>
      </div>
    </>
  )
}

function LayerItem({
  element,
  document,
  activePageId,
  selectedId,
  depth,
  onSelect,
  onMove,
}: {
  element: FunnelElement
  document: FunnelDocument
  activePageId: string
  selectedId: string | null
  depth: number
  onSelect: (id: string) => void
  onMove: (movingId: string, parentId: string | null, index?: number) => void
}) {
  const [open, setOpen] = useState(true)
  const children = getChildren(document.elements, activePageId, element.id)
  const siblings = getChildren(document.elements, activePageId, element.parentId)
  const siblingIndex = siblings.findIndex((sibling) => sibling.id === element.id)
  const definition = ELEMENT_REGISTRY[element.type]
  const Icon = iconMap[definition.icon] ?? Sparkles
  return (
    <div>
      <div
        draggable
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData(FUNNEL_INSTANCE_MIME, element.id)
        }}
        onDragOver={(event) => {
          if (element.type === 'section' || element.type === 'container') event.preventDefault()
        }}
        onDrop={(event) => {
          const movingId = event.dataTransfer.getData(FUNNEL_INSTANCE_MIME)
          if (movingId && (element.type === 'section' || element.type === 'container')) {
            event.preventDefault()
            event.stopPropagation()
            onMove(movingId, element.id)
          }
        }}
        className={`group flex h-8 items-center gap-1.5 rounded-lg pr-2 text-[11px] transition ${selectedId === element.id ? 'bg-violet-500/12 text-violet-700' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <button type="button" onClick={() => setOpen((value) => !value)} className={`p-0.5 ${children.length ? '' : 'invisible'}`}>{open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</button>
        <button type="button" onClick={() => onSelect(element.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icon className="size-3 shrink-0" /><span className="truncate">{definition.label}</span>
        </button>
        <span className="flex items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" disabled={siblingIndex <= 0} onClick={() => onMove(element.id, element.parentId, siblingIndex - 1)} className="rounded p-0.5 hover:bg-accent disabled:opacity-20" aria-label={`Mover ${definition.label} para cima`}><ArrowUp className="size-3" /></button>
          <button type="button" disabled={siblingIndex < 0 || siblingIndex >= siblings.length - 1} onClick={() => onMove(element.id, element.parentId, siblingIndex + 1)} className="rounded p-0.5 hover:bg-accent disabled:opacity-20" aria-label={`Mover ${definition.label} para baixo`}><ArrowDown className="size-3" /></button>
        </span>
      </div>
      {open && children.map((child) => <LayerItem key={child.id} element={child} document={document} activePageId={activePageId} selectedId={selectedId} depth={depth + 1} onSelect={onSelect} onMove={onMove} />)}
    </div>
  )
}

function LayersPanel({ document, activePageId, selectedId, onSelect, onMove, onMoveToPage }: { document: FunnelDocument; activePageId: string; selectedId: string | null; onSelect: (id: string) => void; onMove: (movingId: string, parentId: string | null, index?: number) => void; onMoveToPage: (movingId: string, pageId: string) => void }) {
  const roots = getChildren(document.elements, activePageId, null)
  const selected = document.elements.find((element) => element.id === selectedId)
  const pages = [...document.pages].sort((left, right) => left.order - right.order)
  return (
    <>
      <PanelHeader title="Camadas" />
      <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
        {roots.length ? roots.map((element) => <LayerItem key={element.id} element={element} document={document} activePageId={activePageId} selectedId={selectedId} depth={0} onSelect={onSelect} onMove={onMove} />) : <p className="px-4 py-8 text-center text-xs text-muted-foreground/60">Esta página ainda não possui camadas.</p>}
      </div>
      {selected && pages.length > 1 && (
        <div className="border-t border-border p-3">
          <label className="block">
            <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">Mover ramo para</span>
            <select value={selected.pageId} onChange={(event) => event.target.value !== selected.pageId && onMoveToPage(selected.id, event.target.value)} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-[11px] text-foreground outline-none focus:border-violet-400/40">
              {pages.map((page) => <option key={page.id} value={page.id} disabled={page.id !== selected.pageId && !canMoveElementToPage(document, selected.id, page.id)}>{page.name}</option>)}
            </select>
          </label>
          <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground/60">O elemento e todos os seus filhos serão movidos juntos.</p>
        </div>
      )}
    </>
  )
}

type VariableDraft = Pick<FunnelVariable, 'key' | 'label' | 'value'>

const responseVariableTypes = new Set<ElementType>([
  'short_text', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio',
  'upload', 'quiz_choice', 'slider', 'rating',
])

function VariablesPanel({ document, onAdd, onUpdate, onDelete }: { document: FunnelDocument; onAdd: (variable: VariableDraft) => void; onUpdate: (id: string, patch: Partial<VariableDraft>) => void; onDelete: (id: string) => void }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<{ key: string; label: string; value: string }>({ key: '', label: '', value: '' })
  const variables = document.variables
  const visibleVariables = useMemo<FunnelVariable[]>(() => {
    const responseVariables: FunnelVariable[] = document.elements.flatMap((element) => {
      if (!responseVariableTypes.has(element.type)) return []
      const fieldKey = typeof element.content.fieldKey === 'string' ? element.content.fieldKey.trim() : ''
      if (!fieldKey) return []
      return [{
        id: `virtual-answer-${element.id}`,
        key: `answer.${fieldKey}`,
        label: typeof element.content.label === 'string' && element.content.label.trim()
          ? element.content.label
          : fieldKey,
        kind: 'answer' as const,
      }]
    })
    const builtIns: FunnelVariable[] = [
      { id: 'virtual-lead-first-name', key: 'lead.first_name', label: 'Primeiro nome', kind: 'lead' },
      { id: 'virtual-lead-email', key: 'lead.email', label: 'E-mail', kind: 'lead' },
      { id: 'virtual-lead-phone', key: 'lead.phone', label: 'Telefone', kind: 'lead' },
      { id: 'virtual-lead-score', key: 'lead.score', label: 'Pontuação do lead', kind: 'lead' },
      { id: 'virtual-system-score', key: 'system.score', label: 'Pontuação atual', kind: 'system' },
      { id: 'virtual-system-result', key: 'system.result', label: 'Resultado atual', kind: 'system' },
      { id: 'virtual-system-page', key: 'system.current_page', label: 'Página atual', kind: 'system' },
      { id: 'virtual-utm-source', key: 'utm_source', label: 'UTM source', kind: 'utm' },
      { id: 'virtual-utm-medium', key: 'utm_medium', label: 'UTM medium', kind: 'utm' },
      { id: 'virtual-utm-campaign', key: 'utm_campaign', label: 'UTM campaign', kind: 'utm' },
      { id: 'virtual-utm-content', key: 'utm_content', label: 'UTM content', kind: 'utm' },
      { id: 'virtual-utm-term', key: 'utm_term', label: 'UTM term', kind: 'utm' },
    ]
    const persistedKeys = new Set(variables.map((variable) => variable.key))
    return [...variables, ...responseVariables, ...builtIns]
      .filter((variable, index, list) => (
        persistedKeys.has(variable.key)
          ? variables.some((persisted) => persisted.id === variable.id)
          : list.findIndex((candidate) => candidate.key === variable.key) === index
      ))
  }, [document.elements, variables])
  const groups = ['answer', 'lead', 'system', 'utm', 'custom'] as const
  const labels = { answer: 'Respostas', lead: 'Lead', system: 'Sistema', utm: 'UTM', custom: 'Personalizadas' }

  const startCreating = () => {
    const count = variables.filter((variable) => variable.kind === 'custom').length + 1
    setDraft({ key: `variavel_${count}`, label: `Variável ${count}`, value: '' })
    setCreating(true)
  }

  const submitVariable = () => {
    if (!draft.key.trim()) return
    onAdd({ key: draft.key, label: draft.label, value: draft.value })
    setCreating(false)
  }

  return (
    <>
      <PanelHeader title="Variáveis" />
      <div className="border-b border-border p-3">
        {creating ? (
          <div className="space-y-2 rounded-xl border border-violet-300/40 bg-violet-500/[0.055] p-2.5">
            <input value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Nome da variável" aria-label="Nome da variável" className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] text-foreground outline-none focus:border-violet-400/40" />
            <input value={draft.key} onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))} placeholder="chave_da_variavel" aria-label="Chave da variável" className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 font-mono text-[10px] text-violet-600 outline-none focus:border-violet-400/40" />
            <input value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder="Valor inicial (opcional)" aria-label="Valor inicial da variável" className="h-8 w-full rounded-lg border border-border bg-muted/40 px-2.5 text-[11px] text-foreground outline-none focus:border-violet-400/40" />
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setCreating(false)} className="h-8 flex-1 rounded-lg border border-border text-[10px] font-semibold text-muted-foreground hover:bg-accent">Cancelar</button>
              <button type="button" disabled={!draft.key.trim()} onClick={submitVariable} className="h-8 flex-1 rounded-lg bg-violet-500 text-[10px] font-semibold text-white hover:bg-violet-400 disabled:opacity-40">Criar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startCreating} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-violet-500 text-[11px] font-semibold text-white transition hover:bg-violet-400"><Plus className="size-3.5" /> Nova variável</button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
        {groups.map((kind) => {
          const items = visibleVariables.filter((variable) => variable.kind === kind)
          if (!items.length) return null
          return (
            <section key={kind} className="mb-5">
              <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">{labels[kind]}</h3>
              <div className="space-y-1.5">
                {items.map((variable) => variable.kind === 'custom' ? (
                  <div key={variable.id} className="rounded-xl border border-border bg-muted/20 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">Personalizada</span>
                      <span className="flex items-center gap-0.5">
                        <button type="button" onClick={() => void navigator.clipboard?.writeText(`{{${variable.key}}}`)} className="rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-violet-600" aria-label={`Copiar variável ${variable.key}`}><Copy className="size-3" /></button>
                        <button type="button" onClick={() => window.confirm(`Excluir a variável “${variable.label || variable.key}”?`) && onDelete(variable.id)} className="rounded p-1 text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-500" aria-label={`Excluir variável ${variable.key}`}><Trash2 className="size-3" /></button>
                      </span>
                    </div>
                    <input value={variable.label ?? ''} onChange={(event) => onUpdate(variable.id, { label: event.target.value })} placeholder="Nome" aria-label={`Nome de ${variable.key}`} className="mb-1.5 h-7 w-full rounded-md border border-border bg-muted/40 px-2 text-[10px] text-foreground outline-none focus:border-violet-400/35" />
                    <span className="mb-1.5 flex h-7 items-center rounded-md border border-border bg-muted/40 px-2 focus-within:border-violet-400/35">
                      <span className="font-mono text-[9px] text-muted-foreground/60">{'{{'}</span>
                      <input value={variable.key} onChange={(event) => onUpdate(variable.id, { key: event.target.value })} onBlur={() => !variable.key.trim() && onUpdate(variable.id, { key: 'variavel' })} aria-label="Chave da variável" className="min-w-0 flex-1 bg-transparent text-center font-mono text-[9px] text-violet-600 outline-none" />
                      <span className="font-mono text-[9px] text-muted-foreground/60">{'}}'}</span>
                    </span>
                    <input value={String(variable.value ?? '')} onChange={(event) => onUpdate(variable.id, { value: event.target.value })} placeholder="Valor inicial" aria-label={`Valor inicial de ${variable.key}`} className="h-7 w-full rounded-md border border-border bg-muted/40 px-2 text-[10px] text-foreground outline-none focus:border-violet-400/35" />
                  </div>
                ) : (
                  <button type="button" key={variable.id} onClick={() => void navigator.clipboard?.writeText(`{{${variable.key}}}`)} className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-left transition hover:border-violet-300/35 hover:bg-violet-500/[0.04]" title="Copiar variável">
                    <span className="block text-[10px] text-muted-foreground">{variable.label || variable.key}</span>
                    <code className="mt-0.5 block truncate text-[9px] text-violet-500">{'{{'}{variable.key}{'}}'}</code>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

export function SidePanel({
  panel,
  document,
  activePageId,
  selectedId,
  onAddElement,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onUpdatePage,
  onReorderPage,
  onSelectElement,
  onMoveElement,
  onMoveElementToPage,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
}: {
  panel: LeftPanel
  document: FunnelDocument
  activePageId: string
  selectedId: string | null
  onAddElement: (type: ElementType) => void
  onSelectPage: (id: string) => void
  onAddPage: () => void
  onDuplicatePage: (id: string) => void
  onDeletePage: (id: string) => void
  onUpdatePage: (id: string, patch: Partial<Pick<FunnelPage, 'name' | 'slug'>>) => void
  onReorderPage: (id: string, targetIndex: number) => void
  onSelectElement: (id: string) => void
  onMoveElement: (movingId: string, parentId: string | null, index?: number) => void
  onMoveElementToPage: (movingId: string, pageId: string) => void
  onAddVariable: (variable: VariableDraft) => void
  onUpdateVariable: (id: string, patch: Partial<VariableDraft>) => void
  onDeleteVariable: (id: string) => void
}) {
  return (
    <aside className="flex h-full w-[244px] shrink-0 flex-col border-r border-border bg-card">
      {panel === 'components' && <ComponentsPanel onAdd={onAddElement} />}
      {panel === 'pages' && <PagesPanel pages={document.pages} activePageId={activePageId} onSelect={onSelectPage} onAdd={onAddPage} onDuplicate={onDuplicatePage} onDelete={onDeletePage} onUpdate={onUpdatePage} onReorder={onReorderPage} />}
      {panel === 'layers' && <LayersPanel document={document} activePageId={activePageId} selectedId={selectedId} onSelect={onSelectElement} onMove={onMoveElement} onMoveToPage={onMoveElementToPage} />}
      {panel === 'variables' && <VariablesPanel document={document} onAdd={onAddVariable} onUpdate={onUpdateVariable} onDelete={onDeleteVariable} />}
    </aside>
  )
}
