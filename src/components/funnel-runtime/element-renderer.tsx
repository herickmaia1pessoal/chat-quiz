'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BadgeCheck,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  ImageIcon,
  Quote,
  Star,
  UploadCloud,
} from 'lucide-react'
import type { Breakpoint, ElementActionType, FunnelElement } from '@/lib/funnel'
import { normalizeFunnelOptions, resolveElementStyles } from '@/lib/funnel'
import { evaluateCondition, interpolateFunnelText } from './variables'
import { safeUrl, toReactStyle, videoEmbedUrl } from './style-utils'
import { FunnelIcon } from '@/components/funnel-shared/funnel-icon'

export type FunnelValue = string | number | boolean | string[] | null

export interface RuntimeAction {
  type: ElementActionType
  target?: string
}

interface ElementRendererProps {
  element: FunnelElement
  breakpoint: Breakpoint
  values: Record<string, FunnelValue>
  variables: Record<string, unknown>
  errors: Record<string, string>
  children?: ReactNode
  onValue: (key: string, value: FunnelValue) => void
  onUpload?: (key: string, file: File) => Promise<string>
  onAction: (action: RuntimeAction) => void
}

function text(content: Record<string, unknown>, key: string, fallback = '') {
  const value = content[key]
  return typeof value === 'string' ? value : fallback
}

function number(content: Record<string, unknown>, key: string, fallback = 0) {
  const value = Number(content[key])
  return Number.isFinite(value) ? value : fallback
}

function options(content: Record<string, unknown>) {
  return normalizeFunnelOptions(content.options)
}

function titledItems(content: Record<string, unknown>) {
  if (!Array.isArray(content.items)) return []
  return content.items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const candidate = item as { title?: unknown; text?: unknown }
    return [{
      title: typeof candidate.title === 'string' ? candidate.title : '',
      text: typeof candidate.text === 'string' ? candidate.text : '',
    }]
  })
}

function formatPhoneInput(rawValue: string) {
  const allDigits = rawValue.replace(/\D/g, '').slice(0, 13)
  const hasBrazilCountryCode = allDigits.length > 11 && allDigits.startsWith('55')
  const digits = (hasBrazilCountryCode ? allDigits.slice(2) : allDigits).slice(0, 11)
  const country = hasBrazilCountryCode ? '+55 ' : ''
  if (digits.length <= 2) return `${country}${digits ? `(${digits}` : ''}`
  const area = digits.slice(0, 2)
  const local = digits.slice(2)
  if (local.length <= 4) return `${country}(${area}) ${local}`
  const split = local.length > 8 ? 5 : 4
  return `${country}(${area}) ${local.slice(0, split)}-${local.slice(split)}`
}

export function isElementVisible(element: FunnelElement, variables: Record<string, unknown>) {
  const group = element.logic.visibility
  if (!group || group.conditions.length === 0) return true
  const results = group.conditions.map((condition) =>
    evaluateCondition(variables[condition.variable], condition.operator, condition.value),
  )
  return group.operator === 'and' ? results.every(Boolean) : results.some(Boolean)
}

function FieldShell({
  element,
  variables,
  error,
  children,
  group = false,
}: {
  element: FunnelElement
  variables: Record<string, unknown>
  error?: string
  children: ReactNode
  group?: boolean
}) {
  const label = interpolateFunnelText(element.content.label, variables)
  const help = interpolateFunnelText(element.content.helpText, variables)
  const fieldKey = text(element.content, 'fieldKey', element.id)

  const labelContent = label ? <>{label}{Boolean(element.content.required) && <span className="ml-1 text-rose-400" aria-hidden="true">*</span>}</> : null
  const feedback = error
    ? <p id={`${fieldKey}-error`} className="text-xs font-medium text-rose-400">{error}</p>
    : help ? <p id={`${fieldKey}-help`} className="text-xs opacity-60">{help}</p> : null

  if (group) {
    return (
      <fieldset className="w-full space-y-2 text-left outline-none" tabIndex={error ? -1 : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${fieldKey}-error` : help ? `${fieldKey}-help` : undefined}>
        {labelContent && <legend className="mb-2 text-sm font-semibold text-current">{labelContent}</legend>}
        {children}
        {feedback}
      </fieldset>
    )
  }

  return (
    <div className="w-full space-y-2 text-left">
      {labelContent && <label htmlFor={`field-${element.id}`} className="block text-sm font-semibold text-current">{labelContent}</label>}
      {children}
      {feedback}
    </div>
  )
}

const fieldClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-white/[.045] px-3.5 text-sm text-current outline-none transition placeholder:text-current/35 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/15'

function Countdown({ minutes, expiredText, showLabels }: { minutes: number; expiredText: string; showLabels: boolean }) {
  const [seconds, setSeconds] = useState(Math.max(0, Math.round(minutes * 60)))

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (seconds === 0 && expiredText) {
    return <p role="timer" aria-live="polite" className="rounded-xl border border-current/10 bg-current/[.045] px-4 py-3 text-sm font-semibold">{expiredText}</p>
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="timer" aria-label={`${hours} horas, ${mins} minutos e ${secs} segundos restantes`}>
      {[hours, mins, secs].map((part, index) => (
        <div key={index} className="min-w-16 rounded-xl border border-white/10 bg-white/[.045] px-3 py-3 text-center">
          <strong className="font-mono text-xl tabular-nums">{String(part).padStart(2, '0')}</strong>
          {showLabels && <span className="mt-1 block text-[9px] uppercase tracking-widest opacity-50">{['horas', 'min', 'seg'][index]}</span>}
        </div>
      ))}
    </div>
  )
}

function UploadField({
  element,
  variables,
  value,
  error,
  onValue,
  onUpload,
}: {
  element: FunnelElement
  variables: Record<string, unknown>
  value: FunnelValue
  error?: string
  onValue: (value: FunnelValue) => void
  onUpload?: (file: File) => Promise<string>
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  return (
    <FieldShell element={element} variables={variables} error={uploadError || error}>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-current/20 bg-current/[.025] p-4 text-center transition hover:bg-current/[.05]">
        <UploadCloud className={`size-5 ${uploading ? 'animate-bounce' : ''}`} />
        <span className="mt-2 text-sm font-medium">{uploading ? 'Enviando...' : typeof value === 'string' && value ? value.split('/').at(-1) : 'Escolher arquivo'}</span>
        <span className="mt-1 text-xs opacity-50">{interpolateFunnelText(element.content.helpText, variables) || 'Até 10 MB'}</span>
        <input
          id={`field-${element.id}`}
          type="file"
          accept={text(element.content, 'accept')}
          required={Boolean(element.content.required)}
          disabled={uploading}
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setUploadError('')
            if (file.size > 10 * 1024 * 1024) {
              setUploadError('O arquivo deve ter no máximo 10 MB.')
              return
            }
            if (!onUpload) {
              onValue(file.name)
              return
            }
            setUploading(true)
            try {
              onValue(await onUpload(file))
            } catch (caught) {
              setUploadError(caught instanceof Error ? caught.message : 'Não foi possível enviar o arquivo.')
            } finally {
              setUploading(false)
            }
          }}
        />
      </label>
    </FieldShell>
  )
}

export function FunnelElementRenderer({
  element,
  breakpoint,
  values,
  variables,
  errors,
  children,
  onValue,
  onUpload,
  onAction,
}: ElementRendererProps) {
  const content = element.content
  const style = useMemo(() => toReactStyle(resolveElementStyles(element, breakpoint)), [element, breakpoint])
  const accentColor = resolveElementStyles(element, breakpoint).accentColor ?? '#8b5cf6'
  const fieldKey = text(content, 'fieldKey', element.id)
  const value = values[fieldKey]
  const interpolated = (key: string, fallback = '') => interpolateFunnelText(text(content, key, fallback), variables)

  if (!isElementVisible(element, variables)) return null

  if (element.type === 'section' || element.type === 'container') {
    return (
      <div
        data-funnel-element={element.id}
        data-element-type={element.type}
        style={{ ...style, marginInline: style.maxWidth ? 'auto' : undefined }}
        className={element.type === 'section' ? 'relative w-full' : 'relative'}
      >
        {children}
      </div>
    )
  }

  let body: ReactNode

  switch (element.type) {
    case 'spacer':
      body = <div aria-hidden="true" style={{ height: number(content, 'height', style.minHeight as number || 40) }} />
      break
    case 'divider':
      body = <hr className="w-full border-0 border-t" style={{ borderColor: style.borderColor || 'currentColor', borderTopWidth: style.borderWidth || 1, opacity: style.opacity ?? 0.35 }} />
      break
    case 'heading':
      body = <h1 className="whitespace-pre-wrap text-balance">{interpolated('text', 'Seu título')}</h1>
      break
    case 'text':
      body = <p className="whitespace-pre-wrap text-pretty">{interpolated('text')}</p>
      break
    case 'image': {
      const src = safeUrl(content.src, true)
      body = src ? (
        <figure className="w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={text(content, 'alt')} className="h-full w-full" style={{ objectFit: style.objectFit || 'cover', borderRadius: style.borderRadius }} />
          {text(content, 'caption') && <figcaption className="mt-2 text-xs opacity-60">{interpolated('caption')}</figcaption>}
        </figure>
      ) : (
        <div className="flex min-h-48 w-full flex-col items-center justify-center rounded-[inherit] border border-dashed border-current/15 bg-current/[.025] opacity-60"><ImageIcon className="size-6" /><span className="mt-2 text-xs">Imagem</span></div>
      )
      break
    }
    case 'video': {
      const src = videoEmbedUrl(content.src)
      const directVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(src)
      body = src ? directVideo ? (
        <video controls src={src} aria-label={text(content, 'title', 'Vídeo')} className="h-full w-full rounded-[inherit]" />
      ) : (
        <iframe src={src} title={text(content, 'title', 'Vídeo')} sandbox="allow-scripts allow-presentation" className="h-full min-h-[inherit] w-full rounded-[inherit] border-0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : <div className="flex min-h-52 items-center justify-center rounded-[inherit] border border-dashed border-current/15 bg-current/[.025] text-xs opacity-60">Adicione a URL do vídeo</div>
      break
    }
    case 'button': {
      const action = (text(content, 'action') || element.logic.actions?.[0]?.type || 'next_page') as ElementActionType
      const target = interpolateFunnelText(text(content, 'target') || element.logic.actions?.[0]?.target || '', variables)
      body = (
        <button type="button" onClick={() => onAction({ type: action, target: target || undefined })} className="inline-flex min-h-11 w-full items-center justify-center rounded-[inherit] px-4 py-2 transition hover:brightness-110 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400">
          {interpolated('text', 'Continuar')}
        </button>
      )
      break
    }
    case 'icon':
      body = <div className="flex flex-col items-center gap-2"><FunnelIcon name={content.icon} style={{ width: style.fontSize || 32, height: style.fontSize || 32 }} />{text(content, 'label') && <span className="text-xs">{interpolated('label')}</span>}</div>
      break
    case 'embed': {
      const url = safeUrl(content.url)
      body = url ? <iframe src={url} title={text(content, 'title', 'Conteúdo incorporado')} loading="lazy" sandbox="allow-scripts allow-forms allow-popups" className="min-h-[inherit] w-full rounded-[inherit] border-0" /> : <div className="flex min-h-36 items-center justify-center rounded-[inherit] border border-dashed border-current/15 text-xs opacity-60">Embed externo</div>
      break
    }
    case 'audio': {
      const src = safeUrl(content.src)
      body = src ? <audio controls src={src} className="w-full">Seu navegador não suporta áudio.</audio> : <div className="rounded-xl border border-dashed border-current/15 p-4 text-center text-xs opacity-60">Adicione a URL do áudio</div>
      break
    }
    case 'short_text':
    case 'email':
    case 'phone':
    case 'number':
    case 'date': {
      const inputType = { short_text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date' }[element.type]
      body = (
        <FieldShell element={element} variables={variables} error={errors[fieldKey]}>
          <input
            id={`field-${element.id}`}
            type={inputType}
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            placeholder={interpolated('placeholder')}
            required={Boolean(content.required)}
            min={content.min as number | undefined}
            max={content.max as number | undefined}
            maxLength={element.type === 'phone' ? 19 : undefined}
            inputMode={element.type === 'phone' ? 'tel' : undefined}
            autoComplete={element.type === 'email' ? 'email' : element.type === 'phone' ? 'tel' : undefined}
            aria-invalid={Boolean(errors[fieldKey])}
            aria-describedby={errors[fieldKey] ? `${fieldKey}-error` : undefined}
            onChange={(event) => onValue(
              fieldKey,
              inputType === 'number' && event.target.value !== ''
                ? Number(event.target.value)
                : element.type === 'phone'
                  ? formatPhoneInput(event.target.value)
                  : event.target.value,
            )}
            className={fieldClass}
          />
        </FieldShell>
      )
      break
    }
    case 'select':
      body = (
        <FieldShell element={element} variables={variables} error={errors[fieldKey]}>
          <select id={`field-${element.id}`} value={typeof value === 'string' ? value : ''} required={Boolean(content.required)} onChange={(event) => onValue(fieldKey, event.target.value)} className={fieldClass}>
            <option value="">{interpolated('placeholder', 'Escolha...')}</option>
            {options(content).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FieldShell>
      )
      break
    case 'checkbox': {
      const selected = Array.isArray(value) ? value : []
      body = (
        <FieldShell element={element} variables={variables} error={errors[fieldKey]} group>
          <div className="grid gap-2">
            {options(content).map((option, index) => (
              <label key={`${option.value}-${index}`} htmlFor={`field-${element.id}-${index}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-current/10 bg-current/[.025] px-3.5 text-sm transition hover:bg-current/[.05]">
                <input id={`field-${element.id}-${index}`} type="checkbox" checked={selected.includes(option.value)} onChange={(event) => onValue(fieldKey, event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} className="size-4 accent-violet-500" />
                {option.label}
              </label>
            ))}
          </div>
        </FieldShell>
      )
      break
    }
    case 'radio':
    case 'quiz_choice':
      body = (
        <FieldShell element={element} variables={variables} error={errors[fieldKey]} group>
          <div className="grid gap-2 sm:grid-cols-2">
            {options(content).map((option, index) => (
              <label key={`${option.value}-${index}`} htmlFor={`field-${element.id}-${index}`} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-sm transition ${value === option.value ? 'border-violet-400 bg-violet-500/12' : 'border-current/10 bg-current/[.025] hover:bg-current/[.05]'}`}>
                <input id={`field-${element.id}-${index}`} type="radio" name={fieldKey} value={option.value} checked={value === option.value} onChange={() => onValue(fieldKey, option.value)} className="size-4" style={{ accentColor }} />
                {option.label}
              </label>
            ))}
          </div>
        </FieldShell>
      )
      break
    case 'upload':
      body = <UploadField element={element} variables={variables} value={value} error={errors[fieldKey]} onValue={(next) => onValue(fieldKey, next)} onUpload={onUpload ? (file) => onUpload(fieldKey, file) : undefined} />
      break
    case 'slider': {
      const min = number(content, 'min', 0)
      const max = Math.max(min, number(content, 'max', 10))
      const step = Math.max(0.01, number(content, 'step', 1))
      const current = Math.max(min, Math.min(max, typeof value === 'number' ? value : min))
      body = <FieldShell element={element} variables={variables} error={errors[fieldKey]}><div className="flex items-center gap-4"><input id={`field-${element.id}`} type="range" min={min} max={max} step={step} value={current} aria-invalid={Boolean(errors[fieldKey])} aria-describedby={errors[fieldKey] ? `${fieldKey}-error` : undefined} onChange={(event) => onValue(fieldKey, Number(event.target.value))} className="w-full" style={{ accentColor }} />{Boolean(content.showValue ?? true) && <output htmlFor={`field-${element.id}`} className="min-w-12 rounded-lg border border-current/10 px-2 py-1 text-center font-mono text-sm">{current}</output>}</div></FieldShell>
      break
    }
    case 'rating': {
      const max = Math.max(1, Math.min(10, Math.round(number(content, 'max', 5))))
      const current = Math.max(0, Math.min(max, typeof value === 'number' ? value : 0))
      body = <FieldShell element={element} variables={variables} error={errors[fieldKey]} group><div className="flex flex-wrap gap-1">{Array.from({ length: max }, (_, index) => index + 1).map((rating) => <button type="button" aria-pressed={rating === current} key={rating} aria-label={`${rating} de ${max} estrelas`} onClick={() => onValue(fieldKey, rating)} className="flex size-11 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: accentColor }}><Star className={`size-7 transition ${rating <= current ? '' : 'opacity-25'}`} style={{ color: rating <= current ? accentColor : undefined, fill: rating <= current ? accentColor : 'none' }} /></button>)}</div></FieldShell>
      break
    }
    case 'progress': {
      const progress = Math.max(0, Math.min(100, number(content, 'value', 40)))
      body = <div className="w-full"><div role="progressbar" aria-label={interpolated('label', 'Progresso')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-current/10"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: accentColor }} /></div>{Boolean(content.showValue) && <span className="mt-2 block text-right text-xs opacity-60">{progress}%</span>}</div>
      break
    }
    case 'countdown':
      body = <div><Clock3 aria-hidden="true" className="mx-auto mb-3 size-5 opacity-60" />{text(content, 'label') && <p className="mb-3 text-sm font-semibold">{interpolated('label')}</p>}<Countdown key={number(content, 'minutes', 15)} minutes={Math.max(0, number(content, 'minutes', 15))} expiredText={interpolated('expiredText', 'Tempo encerrado')} showLabels={Boolean(content.showLabels ?? true)} /></div>
      break
    case 'accordion':
    case 'faq': {
      const items = titledItems(content)
      body = <section className="w-full">{text(content, 'title') && <h2 className="mb-5 text-2xl font-bold">{interpolated('title')}</h2>}<div className="grid w-full gap-2">{items.map((item, index) => <details key={index} className="group rounded-xl border border-current/10 bg-current/[.025] p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">{interpolateFunnelText(item.title, variables) || `Item ${index + 1}`}<ChevronDown aria-hidden="true" className="size-4 shrink-0 transition group-open:rotate-180" /></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 opacity-65">{interpolateFunnelText(item.text, variables)}</p></details>)}</div></section>
      break
    }
    case 'offer':
      body = <section>{text(content, 'eyebrow') && <span className="inline-flex rounded-full px-3 py-1 text-xs font-bold" style={{ color: accentColor, backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}>{interpolated('eyebrow')}</span>}<h2 className="mt-4 whitespace-pre-wrap text-3xl font-extrabold leading-tight">{interpolated('title')}</h2><p className="mt-3 whitespace-pre-wrap leading-relaxed opacity-65">{interpolated('text')}</p></section>
      break
    case 'price': {
      const features = Array.isArray(content.features) ? content.features.map((item) => interpolateFunnelText(item, variables)).filter(Boolean) : []
      body = <section><p className="text-sm font-semibold opacity-65">{interpolated('name')}</p><div className="mt-2 flex flex-wrap items-baseline justify-center gap-1.5"><strong className="text-4xl font-extrabold">{interpolated('price')}</strong><span className="text-xs opacity-50">{interpolated('period')}</span></div>{text(content, 'description') && <p className="mt-3 text-sm leading-6 opacity-60">{interpolated('description')}</p>}{features.length > 0 && <ul className="mt-5 grid gap-2 text-left text-sm">{features.map((feature, index) => <li key={`${feature}-${index}`} className="flex items-center gap-2"><Check aria-hidden="true" className="size-4 shrink-0" style={{ color: accentColor }} />{feature}</li>)}</ul>}</section>
      break
    }
    case 'testimonial': {
      const avatar = safeUrl(content.avatar, true)
      body = (
        <figure>
          <Quote aria-hidden="true" className="size-6" style={{ color: accentColor }} />
          <blockquote className="mt-4 whitespace-pre-wrap text-lg leading-8">“{interpolated('quote')}”</blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-9 rounded-full object-cover" />
            ) : <CircleUserRound aria-hidden="true" className="size-9 opacity-40" />}
            <span><strong className="block text-sm">{interpolated('author')}</strong><span className="text-xs opacity-50">{interpolated('role')}</span></span>
          </figcaption>
        </figure>
      )
      break
    }
    case 'benefits': {
      const items = Array.isArray(content.items) ? content.items.map((item) => interpolateFunnelText(item, variables)).filter(Boolean) : []
      body = <section><h2 className="text-2xl font-bold">{interpolated('title')}</h2><ul className="mt-5 grid gap-3">{items.map((item, index) => <li key={`${item}-${index}`} className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/12"><Check aria-hidden="true" className="size-3.5 text-emerald-400" /></span>{item}</li>)}</ul></section>
      break
    }
    case 'cta': {
      const action = (text(content, 'action') || element.logic.actions?.[0]?.type || 'next_page') as ElementActionType
      const target = interpolateFunnelText(text(content, 'target') || element.logic.actions?.[0]?.target || '', variables)
      body = <section><BadgeCheck aria-hidden="true" className="mx-auto size-7" style={{ color: accentColor }} /><h2 className="mt-4 whitespace-pre-wrap text-2xl font-extrabold">{interpolated('title')}</h2><p className="mt-2 whitespace-pre-wrap opacity-65">{interpolated('text')}</p><button type="button" onClick={() => onAction({ type: action, target: target || undefined })} className="mt-5 min-h-11 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: accentColor }}>{interpolated('buttonText', 'Continuar')}</button></section>
      break
    }
    case 'social_proof':
      body = <section><strong className="block text-4xl font-extrabold" style={{ color: accentColor }}>{interpolated('value')}</strong><span className="mt-2 block text-sm opacity-65">{interpolated('label')}</span>{text(content, 'supportingText') && <p className="mt-2 text-xs opacity-45">{interpolated('supportingText')}</p>}</section>
      break
    case 'logo_cloud': {
      const logos = Array.isArray(content.logos) ? content.logos.map((item) => interpolateFunnelText(item, variables)).filter(Boolean) : []
      body = (
        <section>
          <p className="text-xs font-bold uppercase tracking-[.16em] opacity-45">{interpolated('title')}</p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-3" aria-label={interpolated('title', 'Marcas parceiras')}>
            {logos.map((logo, index) => {
              const logoUrl = safeUrl(logo, true)
              return (
                <li key={`${logo}-${index}`} className="grid min-h-12 min-w-24 place-items-center rounded-xl border border-current/10 bg-current/[.025] px-5 py-3 text-sm font-bold opacity-60">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="max-h-8 max-w-28 object-contain" />
                  ) : logo}
                </li>
              )
            })}
          </ul>
        </section>
      )
      break
    }
    default:
      body = <div className="rounded-xl border border-dashed border-current/15 p-5 text-center text-xs opacity-50">Componente {element.type}</div>
  }

  return <div data-funnel-element={element.id} data-element-type={element.type} style={{ ...style, marginInline: style.maxWidth ? 'auto' : undefined }}>{body}</div>
}
