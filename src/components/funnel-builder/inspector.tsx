'use client'

import { FolderOpen, Plus, RotateCcw, SlidersHorizontal, Tag, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import {
  ELEMENT_REGISTRY,
  hasBreakpointOverride,
  normalizeFunnelOptions,
  type Breakpoint,
  type ElementType,
  type FunnelChoiceOption,
  type FunnelElement,
  type FunnelPage,
  type InspectorFieldDefinition,
  type StyleProperties,
} from '@/lib/funnel'
import { MediaLibrary } from '@/components/dashboard-v2/media-library'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type InspectorTab = 'content' | 'style' | 'logic'

const fieldClass = 'h-9 w-full rounded-lg border border-white/10 bg-[#111116] px-3 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/70 focus:ring-2 focus:ring-violet-500/10'
const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500'

// Fields where a URL points at a media file, so the "Escolher da Biblioteca"
// picker button is worth showing next to the manual input. Keyed by
// `${elementType}.${fieldKey}` — anything else (e.g. a plain CTA link) stays
// a bare URL input.
const MEDIA_URL_FIELDS = new Set([
  'image.src',
  'video.src',
  'audio.src',
  'embed.url',
  'testimonial.avatar',
])

// Element types whose `options` field is a set of choices someone picks
// from (as opposed to a plain string list like logo_cloud.logos or
// price.features) — these get the richer label+tag editor.
const CHOICE_ELEMENT_TYPES = new Set<ElementType>(['select', 'checkbox', 'radio', 'quiz_choice'])

function toInputValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return value
  return ''
}

function ContentField({
  field,
  element,
  onChange,
  funnelId,
  workspaceId,
}: {
  field: InspectorFieldDefinition
  element: FunnelElement
  onChange: (value: unknown) => void
  funnelId?: string
  workspaceId?: string
}) {
  const value = element.content[field.key]
  const [pickerOpen, setPickerOpen] = useState(false)
  if (field.control === 'options') {
    if ((element.type === 'accordion' || element.type === 'faq') && field.key === 'items') {
      const items = Array.isArray(value)
        ? value.map((item) => {
            if (!item || typeof item !== 'object') return { title: '', text: '' }
            const candidate = item as { title?: unknown; text?: unknown }
            return {
              title: typeof candidate.title === 'string' ? candidate.title : '',
              text: typeof candidate.text === 'string' ? candidate.text : '',
            }
          })
        : []

      return (
        <fieldset className="space-y-2.5">
          <legend className={labelClass}>{field.label}</legend>
          {items.map((item, index) => (
            <div key={index} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Item {index + 1}</span>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`Excluir item ${index + 1}`}
                  className="rounded-md p-1 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <label className="block">
                <span className="sr-only">Título do item {index + 1}</span>
                <input
                  value={item.title}
                  onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, title: event.target.value } : current))}
                  placeholder="Pergunta ou título"
                  className={fieldClass}
                />
              </label>
              <label className="mt-2 block">
                <span className="sr-only">Conteúdo do item {index + 1}</span>
                <textarea
                  value={item.text}
                  rows={3}
                  onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, text: event.target.value } : current))}
                  placeholder="Resposta ou conteúdo"
                  className={`${fieldClass} h-auto resize-y py-2.5 leading-relaxed`}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...items, { title: 'Novo item', text: 'Escreva o conteúdo aqui.' }])}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 text-[11px] font-semibold text-zinc-500 transition hover:border-violet-400/35 hover:text-violet-300"
          >
            <Plus className="size-3.5" /> Adicionar item
          </button>
        </fieldset>
      )
    }

    if (field.key === 'options' && CHOICE_ELEMENT_TYPES.has(element.type)) {
      const options = normalizeFunnelOptions(value)
      const updateOption = (index: number, patch: Partial<FunnelChoiceOption>) => onChange(
        options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option),
      )
      return (
        <fieldset className="space-y-2.5">
          <legend className={labelClass}>{field.label}</legend>
          {options.map((option, index) => (
            <div key={index} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Opção {index + 1}</span>
                <button
                  type="button"
                  onClick={() => onChange(options.filter((_, optionIndex) => optionIndex !== index))}
                  aria-label={`Excluir opção ${index + 1}`}
                  className="rounded-md p-1 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <label className="block">
                <span className="sr-only">Texto da opção {index + 1}</span>
                <input
                  value={option.label}
                  onChange={(event) => updateOption(index, { label: event.target.value, value: event.target.value })}
                  placeholder="Texto exibido"
                  className={fieldClass}
                />
              </label>
              <label className="mt-2 flex items-center gap-2">
                <Tag className="size-3.5 shrink-0 text-zinc-600" />
                <span className="sr-only">Tag de qualificação da opção {index + 1}</span>
                <input
                  value={option.tag ?? ''}
                  onChange={(event) => updateOption(index, { tag: event.target.value })}
                  placeholder="Tag (opcional, ex: alta-intencao)"
                  className={fieldClass}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...options, { label: `Opção ${options.length + 1}`, value: `Opção ${options.length + 1}` }])}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 text-[11px] font-semibold text-zinc-500 transition hover:border-violet-400/35 hover:text-violet-300"
          >
            <Plus className="size-3.5" /> Adicionar opção
          </button>
          <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
            A tag é aplicada ao lead quando esta opção é escolhida — use para qualificar respostas (ex: &quot;pronto-para-comprar&quot;).
          </p>
        </fieldset>
      )
    }

    const entries = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return (
      <label className="block">
        <span className={labelClass}>{field.label} (um por linha)</span>
        <textarea
          value={entries.join('\n')}
          rows={Math.max(4, Math.min(8, entries.length + 1))}
          onChange={(event) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))}
          placeholder="Primeiro item\nSegundo item"
          className={`${fieldClass} h-auto resize-y py-2.5 leading-relaxed`}
        />
      </label>
    )
  }
  if (field.control === 'toggle') {
    return (
      <label className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5 text-xs text-zinc-300">
        {field.label}
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          onClick={() => onChange(!value)}
          className={`relative h-5 w-9 rounded-full transition ${value ? 'bg-violet-500' : 'bg-zinc-700'}`}
        >
          <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${value ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </label>
    )
  }
  if (field.control === 'textarea') {
    return (
      <label className="block">
        <span className={labelClass}>{field.label}</span>
        <textarea
          value={toInputValue(value)}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={`${fieldClass} h-auto resize-y py-2.5 leading-relaxed`}
        />
      </label>
    )
  }
  if (field.control === 'select') {
    return (
      <label className="block">
        <span className={labelClass}>{field.label}</span>
        <select value={toInputValue(value)} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    )
  }
  const isMediaUrlField = field.control === 'url' && MEDIA_URL_FIELDS.has(`${element.type}.${field.key}`)

  return (
    <label className="block">
      <span className={labelClass}>{field.label}</span>
      <div className="flex gap-1.5">
        <input
          type={field.control === 'number' ? 'number' : field.control === 'color' ? 'color' : field.control === 'url' ? 'url' : 'text'}
          value={toInputValue(value)}
          onChange={(event) => onChange(field.control === 'number' ? Number(event.target.value) : event.target.value)}
          placeholder={field.placeholder}
          className={field.control === 'color' ? 'h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-[#111116] p-1' : fieldClass}
        />
        {isMediaUrlField && workspaceId && funnelId && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="Escolher da Biblioteca"
            aria-label="Escolher da Biblioteca de mídia"
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#111116] px-2.5 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300"
          >
            <FolderOpen className="size-3.5" />
          </button>
        )}
      </div>
      {isMediaUrlField && workspaceId && funnelId && (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-3xl border border-white/[0.08] bg-[#0a0a0e] p-0 text-zinc-200 sm:max-w-3xl">
            <DialogHeader className="border-b border-white/[0.07] px-5 py-4">
              <DialogTitle className="text-sm font-semibold text-zinc-100">Biblioteca de mídia</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto px-5 pb-5">
              <MediaLibrary
                workspaceId={workspaceId}
                funnels={[{ id: funnelId, name: element.type }]}
                mode="picker"
                pickerFunnelId={funnelId}
                onSelect={(url) => {
                  onChange(url)
                  setPickerOpen(false)
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </label>
  )
}

function StyleField({
  label,
  property,
  type = 'number',
  value,
  overridden,
  onChange,
  onClear,
  options,
}: {
  label: string
  property: keyof StyleProperties
  type?: 'number' | 'text' | 'color' | 'select'
  value: unknown
  overridden: boolean
  onChange: (value: string | number) => void
  onClear: () => void
  options?: Array<{ label: string; value: string }>
}) {
  return (
    <label className="block" data-style-property={property}>
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className={labelClass.replace('mb-1.5 ', '')}>{label}</span>
        {overridden && (
          <button type="button" onClick={onClear} title="Voltar a herdar do desktop" className="text-violet-400 transition hover:text-violet-300">
            <RotateCcw className="size-3" />
          </button>
        )}
      </span>
      {type === 'select' ? (
        <select value={toInputValue(value)} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
          {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={toInputValue(value)}
          onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
          className={type === 'color' ? 'h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-[#111116] p-1' : fieldClass}
        />
      )}
    </label>
  )
}

function ScoringEditor({
  element,
  onChange,
}: {
  element: FunnelElement
  onChange: (updater: (element: FunnelElement) => FunnelElement) => void
}) {
  if (!['quiz_choice', 'slider', 'rating'].includes(element.type)) return null

  const rules = element.logic.scoring ?? []
  const updateRule = (value: string | number, points: number) => onChange((current) => {
    const existing = current.logic.scoring ?? []
    const match = existing.find((rule) => String(rule.value) === String(value))
    const nextRule = { id: match?.id ?? crypto.randomUUID(), value, points }
    return {
      ...current,
      logic: {
        ...current.logic,
        scoring: [...existing.filter((rule) => String(rule.value) !== String(value)), nextRule],
      },
    }
  })

  const removeRule = (id: string) => onChange((current) => ({
    ...current,
    logic: { ...current.logic, scoring: (current.logic.scoring ?? []).filter((rule) => rule.id !== id) },
  }))

  if (element.type === 'quiz_choice') {
    const choices = normalizeFunnelOptions(element.content.options)
    return (
      <fieldset className="space-y-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Pontos por resposta</legend>
        {choices.map((choice) => (
          <label key={choice.value} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{choice.label}</span>
            <input
              type="number"
              value={rules.find((rule) => String(rule.value) === choice.value)?.points ?? 0}
              onChange={(event) => updateRule(choice.value, Number(event.target.value))}
              aria-label={`Pontos para ${choice.label}`}
              className={`${fieldClass} w-20 text-right`}
            />
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <fieldset className="space-y-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Pontos por valor</legend>
      {rules.map((rule, index) => (
        <div key={rule.id} className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className={labelClass}>Valor</span>
            <input
              type="number"
              value={toInputValue(rule.value)}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                onChange((current) => ({
                  ...current,
                  logic: {
                    ...current.logic,
                    scoring: (current.logic.scoring ?? []).map((currentRule) => currentRule.id === rule.id ? { ...currentRule, value: nextValue } : currentRule),
                  },
                }))
              }}
              aria-label={`Valor da regra ${index + 1}`}
              className={fieldClass}
            />
          </label>
          <label className="w-20">
            <span className={labelClass}>Pontos</span>
            <input type="number" value={rule.points} onChange={(event) => updateRule(rule.value as string | number, Number(event.target.value))} className={fieldClass} />
          </label>
          <button type="button" onClick={() => removeRule(rule.id)} aria-label={`Excluir regra ${index + 1}`} className="mb-0.5 rounded-lg p-2.5 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="size-3.5" /></button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange((current) => ({
          ...current,
          logic: {
            ...current.logic,
            scoring: [...(current.logic.scoring ?? []), {
              id: crypto.randomUUID(),
              value: element.type === 'slider' ? Number(element.content.min ?? 0) : 1,
              points: 0,
            }],
          },
        }))}
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-semibold text-zinc-500 transition hover:border-violet-400/35 hover:text-violet-300"
      >
        <Plus className="size-3" /> Adicionar regra
      </button>
    </fieldset>
  )
}

export function Inspector({
  element,
  breakpoint,
  pages,
  onChange,
  onClose,
  funnelId,
  workspaceId,
}: {
  element: FunnelElement | null
  breakpoint: Breakpoint
  pages: FunnelPage[]
  onChange: (updater: (element: FunnelElement) => FunnelElement) => void
  onClose: () => void
  funnelId?: string
  workspaceId?: string
}) {
  const [tab, setTab] = useState<InspectorTab>('content')

  if (!element) {
    return (
      <aside className="flex h-full w-[292px] shrink-0 flex-col border-l border-white/[0.07] bg-[#0a0a0e]">
        <div className="flex h-12 items-center border-b border-white/[0.07] px-4 text-xs font-semibold text-zinc-300">
          <SlidersHorizontal className="mr-2 size-3.5 text-violet-400" /> Inspector
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-zinc-600">
            <SlidersHorizontal className="size-5" />
          </div>
          <p className="text-sm font-semibold text-zinc-300">Nenhum elemento selecionado</p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-600">Selecione um item no canvas ou nas Camadas para editar conteúdo, estilo e lógica.</p>
        </div>
      </aside>
    )
  }

  const definition = ELEMENT_REGISTRY[element.type]
  const responsiveStyle = breakpoint === 'desktop'
    ? element.styles.desktop
    : { ...element.styles.desktop, ...(element.styles[breakpoint] ?? {}) }
  const contentFields = definition.inspectorSections.flatMap((section) => section.fields).filter((field) => field.target === 'content')

  const updateContent = (key: string, value: unknown) => onChange((current) => ({
    ...current,
    content: { ...current.content, [key]: value },
  }))

  const updateContentField = (key: string, value: unknown) => {
    if (key !== 'action') {
      updateContent(key, value)
      return
    }
    onChange((current) => ({
      ...current,
      content: {
        ...current.content,
        action: value,
        target: value === 'go_to_page' ? pages[0]?.id ?? '' : '',
      },
    }))
  }

  const updateStyle = (property: keyof StyleProperties, value: string | number) => onChange((current) => ({
    ...current,
    styles: {
      ...current.styles,
      [breakpoint]: {
        ...(current.styles[breakpoint] ?? {}),
        [property]: value,
      },
    },
  }))

  const clearStyle = (property: keyof StyleProperties) => onChange((current) => {
    if (breakpoint === 'desktop') return current
    const override = { ...(current.styles[breakpoint] ?? {}) }
    delete override[property]
    return { ...current, styles: { ...current.styles, [breakpoint]: override } }
  })

  const overridden = (property: keyof StyleProperties) => breakpoint !== 'desktop' && hasBreakpointOverride(element, breakpoint, property)

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-l border-white/[0.07] bg-[#0a0a0e]">
      <div className="flex min-h-14 items-center gap-3 border-b border-white/[0.07] px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-bold text-violet-300">
          {definition.label.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-zinc-200">{definition.label}</p>
          <p className="text-[10px] text-zinc-600">Breakpoint: {breakpoint}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-600 hover:bg-white/5 hover:text-zinc-300"><X className="size-3.5" /></button>
      </div>

      <div className="grid grid-cols-3 border-b border-white/[0.07] px-2 pt-1">
        {(['content', 'style', 'logic'] as InspectorTab[]).map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`border-b-2 px-2 py-2.5 text-[11px] font-semibold capitalize transition ${tab === item ? 'border-violet-500 text-white' : 'border-transparent text-zinc-600 hover:text-zinc-300'}`}
          >
            {item === 'content' ? 'Conteúdo' : item === 'style' ? 'Estilo' : 'Lógica'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
        {tab === 'content' && (
          <div className="space-y-4">
            {contentFields.length === 0 && (
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs leading-relaxed text-zinc-500">
                Este elemento não possui conteúdo textual. Ajuste sua estrutura na aba Estilo.
              </div>
            )}
            {contentFields.map((field) => (
              <ContentField key={field.key} field={field} element={element} onChange={(value) => updateContentField(field.key, value)} funnelId={funnelId} workspaceId={workspaceId} />
            ))}
            {(element.type === 'button' || element.type === 'cta') && (
              <>
                {element.content.action === 'go_to_page' && (
                  <label className="block">
                    <span className={labelClass}>Página de destino</span>
                    <select value={toInputValue(element.content.target)} onChange={(event) => updateContent('target', event.target.value)} className={fieldClass}>
                      {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                    </select>
                  </label>
                )}
                {element.content.action === 'open_url' && (
                  <label className="block"><span className={labelClass}>URL</span><input type="url" value={toInputValue(element.content.target)} onChange={(event) => updateContent('target', event.target.value)} placeholder="https://" className={fieldClass} /></label>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'style' && (
          <div className="space-y-5">
            {breakpoint !== 'desktop' && (
              <div className="rounded-xl border border-violet-400/15 bg-violet-500/[0.06] p-3 text-[11px] leading-relaxed text-violet-200/70">
                Você está criando sobrescritas para {breakpoint}. Use <RotateCcw className="mx-0.5 inline size-3" /> para herdar do desktop.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <StyleField label="Espaço" property="gap" value={responsiveStyle.gap ?? 0} overridden={overridden('gap')} onChange={(value) => updateStyle('gap', value)} onClear={() => clearStyle('gap')} />
              <StyleField label="Raio" property="borderRadius" value={responsiveStyle.borderRadius ?? 0} overridden={overridden('borderRadius')} onChange={(value) => updateStyle('borderRadius', value)} onClear={() => clearStyle('borderRadius')} />
              <StyleField label="Padding X" property="paddingX" value={responsiveStyle.paddingX ?? 0} overridden={overridden('paddingX')} onChange={(value) => updateStyle('paddingX', value)} onClear={() => clearStyle('paddingX')} />
              <StyleField label="Padding Y" property="paddingY" value={responsiveStyle.paddingY ?? 0} overridden={overridden('paddingY')} onChange={(value) => updateStyle('paddingY', value)} onClear={() => clearStyle('paddingY')} />
              <StyleField label="Tamanho" property="fontSize" value={responsiveStyle.fontSize ?? 16} overridden={overridden('fontSize')} onChange={(value) => updateStyle('fontSize', value)} onClear={() => clearStyle('fontSize')} />
              <StyleField label="Peso" property="fontWeight" value={responsiveStyle.fontWeight ?? 400} overridden={overridden('fontWeight')} onChange={(value) => updateStyle('fontWeight', value)} onClear={() => clearStyle('fontWeight')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StyleField label="Largura" property="width" type="text" value={responsiveStyle.width ?? '100%'} overridden={overridden('width')} onChange={(value) => updateStyle('width', value)} onClear={() => clearStyle('width')} />
              <StyleField label="Largura máx." property="maxWidth" type="text" value={responsiveStyle.maxWidth ?? ''} overridden={overridden('maxWidth')} onChange={(value) => updateStyle('maxWidth', value)} onClear={() => clearStyle('maxWidth')} />
              <StyleField label="Altura mín." property="minHeight" value={responsiveStyle.minHeight ?? 0} overridden={overridden('minHeight')} onChange={(value) => updateStyle('minHeight', value)} onClear={() => clearStyle('minHeight')} />
              <StyleField label="Colunas" property="columns" value={responsiveStyle.columns ?? 1} overridden={overridden('columns')} onChange={(value) => updateStyle('columns', value)} onClear={() => clearStyle('columns')} />
              <StyleField label="Margem acima" property="marginTop" value={responsiveStyle.marginTop ?? 0} overridden={overridden('marginTop')} onChange={(value) => updateStyle('marginTop', value)} onClear={() => clearStyle('marginTop')} />
              <StyleField label="Margem abaixo" property="marginBottom" value={responsiveStyle.marginBottom ?? 0} overridden={overridden('marginBottom')} onChange={(value) => updateStyle('marginBottom', value)} onClear={() => clearStyle('marginBottom')} />
              <StyleField label="Espessura borda" property="borderWidth" value={responsiveStyle.borderWidth ?? 0} overridden={overridden('borderWidth')} onChange={(value) => updateStyle('borderWidth', value)} onClear={() => clearStyle('borderWidth')} />
              <StyleField label="Opacidade" property="opacity" value={responsiveStyle.opacity ?? 1} overridden={overridden('opacity')} onChange={(value) => updateStyle('opacity', value)} onClear={() => clearStyle('opacity')} />
            </div>
            <StyleField label="Direção" property="flexDirection" type="select" value={responsiveStyle.flexDirection ?? 'column'} overridden={overridden('flexDirection')} onChange={(value) => updateStyle('flexDirection', value)} onClear={() => clearStyle('flexDirection')} options={[{ label: 'Vertical', value: 'column' }, { label: 'Horizontal', value: 'row' }]} />
            <StyleField label="Alinhar itens" property="alignItems" type="select" value={responsiveStyle.alignItems ?? 'stretch'} overridden={overridden('alignItems')} onChange={(value) => updateStyle('alignItems', value)} onClear={() => clearStyle('alignItems')} options={[{ label: 'Início', value: 'start' }, { label: 'Centro', value: 'center' }, { label: 'Fim', value: 'end' }, { label: 'Esticar', value: 'stretch' }]} />
            <StyleField label="Distribuir conteúdo" property="justifyContent" type="select" value={responsiveStyle.justifyContent ?? 'start'} overridden={overridden('justifyContent')} onChange={(value) => updateStyle('justifyContent', value)} onClear={() => clearStyle('justifyContent')} options={[{ label: 'Início', value: 'start' }, { label: 'Centro', value: 'center' }, { label: 'Fim', value: 'end' }, { label: 'Entre itens', value: 'between' }]} />
            <StyleField label="Alinhamento do texto" property="textAlign" type="select" value={responsiveStyle.textAlign ?? 'left'} overridden={overridden('textAlign')} onChange={(value) => updateStyle('textAlign', value)} onClear={() => clearStyle('textAlign')} options={[{ label: 'Esquerda', value: 'left' }, { label: 'Centro', value: 'center' }, { label: 'Direita', value: 'right' }]} />
            <StyleField label="Sombra" property="shadow" type="select" value={responsiveStyle.shadow ?? 'none'} overridden={overridden('shadow')} onChange={(value) => updateStyle('shadow', value)} onClear={() => clearStyle('shadow')} options={[{ label: 'Nenhuma', value: 'none' }, { label: 'Pequena', value: 'sm' }, { label: 'Média', value: 'md' }, { label: 'Grande', value: 'lg' }, { label: 'Glow', value: 'glow' }]} />
            <StyleField label="Ajuste da mídia" property="objectFit" type="select" value={responsiveStyle.objectFit ?? 'cover'} overridden={overridden('objectFit')} onChange={(value) => updateStyle('objectFit', value)} onClear={() => clearStyle('objectFit')} options={[{ label: 'Cobrir', value: 'cover' }, { label: 'Conter', value: 'contain' }]} />
            <div className="grid grid-cols-2 gap-3">
              <StyleField label="Fundo" property="backgroundColor" type="color" value={responsiveStyle.backgroundColor ?? '#09090b'} overridden={overridden('backgroundColor')} onChange={(value) => updateStyle('backgroundColor', value)} onClear={() => clearStyle('backgroundColor')} />
              <StyleField label="Texto" property="textColor" type="color" value={responsiveStyle.textColor ?? '#fafafa'} overridden={overridden('textColor')} onChange={(value) => updateStyle('textColor', value)} onClear={() => clearStyle('textColor')} />
              <StyleField label="Borda" property="borderColor" type="color" value={responsiveStyle.borderColor ?? '#27272a'} overridden={overridden('borderColor')} onChange={(value) => updateStyle('borderColor', value)} onClear={() => clearStyle('borderColor')} />
              <StyleField label="Destaque" property="accentColor" type="color" value={responsiveStyle.accentColor ?? '#8b5cf6'} overridden={overridden('accentColor')} onChange={(value) => updateStyle('accentColor', value)} onClear={() => clearStyle('accentColor')} />
            </div>
          </div>
        )}

        {tab === 'logic' && (
          <div className="space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-xs text-zinc-300">
              Exibição condicional
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(element.logic.visibility)}
                onClick={() => onChange((current) => ({
                  ...current,
                  logic: {
                    ...current.logic,
                    visibility: current.logic.visibility ? undefined : {
                      operator: 'and',
                      conditions: [{ id: crypto.randomUUID(), variable: '', operator: 'equals', value: '' }],
                    },
                  },
                }))}
                className={`relative h-5 w-9 rounded-full transition ${element.logic.visibility ? 'bg-violet-500' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${element.logic.visibility ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </label>
            {element.logic.visibility && (
              <div className="space-y-3 rounded-xl border border-violet-400/15 bg-violet-500/[0.04] p-3">
                <label className="block"><span className={labelClass}>Variável</span><input value={element.logic.visibility.conditions[0]?.variable ?? ''} onChange={(event) => onChange((current) => ({ ...current, logic: { ...current.logic, visibility: { operator: current.logic.visibility?.operator ?? 'and', conditions: [{ ...(current.logic.visibility?.conditions[0] ?? { id: crypto.randomUUID(), operator: 'equals' }), variable: event.target.value }] } } }))} placeholder="answer.campo" className={fieldClass} /></label>
                <label className="block"><span className={labelClass}>Operador</span><select value={element.logic.visibility.conditions[0]?.operator ?? 'equals'} onChange={(event) => onChange((current) => ({ ...current, logic: { ...current.logic, visibility: { operator: current.logic.visibility?.operator ?? 'and', conditions: [{ ...(current.logic.visibility?.conditions[0] ?? { id: crypto.randomUUID(), variable: '' }), operator: event.target.value as 'equals' }] } } }))} className={fieldClass}><option value="equals">É igual a</option><option value="not_equals">É diferente de</option><option value="contains">Contém</option><option value="is_empty">Está vazio</option><option value="is_not_empty">Não está vazio</option></select></label>
                <label className="block"><span className={labelClass}>Valor</span><input value={toInputValue(element.logic.visibility.conditions[0]?.value)} onChange={(event) => onChange((current) => ({ ...current, logic: { ...current.logic, visibility: { operator: current.logic.visibility?.operator ?? 'and', conditions: [{ ...(current.logic.visibility?.conditions[0] ?? { id: crypto.randomUUID(), variable: '', operator: 'equals' }), value: event.target.value }] } } }))} className={fieldClass} /></label>
              </div>
            )}
            <ScoringEditor element={element} onChange={onChange} />
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs leading-relaxed text-zinc-500">
              A condição usa chaves estáveis de resposta e variáveis. As ramificações entre páginas são configuradas no modo Fluxo.
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
