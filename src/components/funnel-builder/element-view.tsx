'use client'

import type { CSSProperties, ReactNode } from 'react'
import {
  AudioLines,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Code2,
  FileUp,
  ImageIcon,
  LayoutGrid,
  MousePointerClick,
  Quote,
  Star,
} from 'lucide-react'
import { normalizeFunnelOptions, resolveElementStyles } from '@/lib/funnel'
import type { Breakpoint, FunnelElement, StyleProperties } from '@/lib/funnel'
import { FunnelIcon } from '@/components/funnel-shared/funnel-icon'
import { safeUrl, videoEmbedUrl } from '@/components/funnel-runtime/style-utils'

function contentString(element: FunnelElement, key: string, fallback = '') {
  const value = element.content[key]
  return typeof value === 'string' ? value : fallback
}

function contentNumber(element: FunnelElement, key: string, fallback: number) {
  const value = element.content[key]
  return typeof value === 'number' ? value : fallback
}

function contentBoolean(element: FunnelElement, key: string, fallback = false) {
  const value = element.content[key]
  return typeof value === 'boolean' ? value : fallback
}

function contentStrings(element: FunnelElement, key: string, fallback: string[] = []) {
  const value = element.content[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback
}

function contentItems(element: FunnelElement, key = 'items') {
  const value = element.content[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (!item || typeof item !== 'object') return { title: '', text: '' }
    const candidate = item as { title?: unknown; text?: unknown }
    return {
      title: typeof candidate.title === 'string' ? candidate.title : '',
      text: typeof candidate.text === 'string' ? candidate.text : '',
    }
  })
}

function alignValue(value?: StyleProperties['alignItems']) {
  if (value === 'start') return 'flex-start'
  if (value === 'end') return 'flex-end'
  return value
}

function justifyValue(value?: StyleProperties['justifyContent']) {
  if (value === 'start') return 'flex-start'
  if (value === 'end') return 'flex-end'
  if (value === 'between') return 'space-between'
  return value
}

export function elementStyleToCss(style: StyleProperties): CSSProperties {
  const shadows: Record<NonNullable<StyleProperties['shadow']>, string> = {
    none: 'none',
    sm: '0 4px 16px rgba(0,0,0,.18)',
    md: '0 12px 32px rgba(0,0,0,.26)',
    lg: '0 24px 64px rgba(0,0,0,.34)',
    glow: '0 0 40px color-mix(in srgb, var(--funnel-accent, #8b5cf6) 35%, transparent)',
  }
  return {
    display: style.columns ? 'grid' : style.display,
    flexDirection: style.flexDirection,
    alignItems: alignValue(style.alignItems),
    justifyContent: justifyValue(style.justifyContent),
    gridTemplateColumns: style.columns ? `repeat(${style.columns}, minmax(0, 1fr))` : undefined,
    gap: style.gap,
    width: style.width,
    maxWidth: style.maxWidth,
    minHeight: style.minHeight,
    paddingInline: style.paddingX,
    paddingBlock: style.paddingY,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    backgroundColor: style.backgroundColor,
    color: style.textColor,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.borderWidth ? 'solid' : undefined,
    borderRadius: style.borderRadius,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    opacity: style.opacity,
    boxShadow: style.shadow ? shadows[style.shadow] : undefined,
    objectFit: style.objectFit,
    ['--funnel-accent' as string]: style.accentColor,
  }
}

const inputClass = 'w-full rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-violet-500/70 focus:ring-2 focus:ring-violet-500/15'

function FieldShell({ element, children, group = false }: { element: FunnelElement; children: ReactNode; group?: boolean }) {
  const label = (
    <>
      {contentString(element, 'label', 'Campo')}
      {contentBoolean(element, 'required') && <span className="text-violet-400" aria-hidden="true">*</span>}
    </>
  )
  const help = contentString(element, 'helpText')

  if (group) {
    return (
      <fieldset className="block w-full text-left">
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">{label}</legend>
        {children}
        {help && <p className="mt-1.5 text-xs text-muted-foreground">{help}</p>}
      </fieldset>
    )
  }

  return (
    <label className="block w-full text-left">
      <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">{label}</span>
      {children}
      {help && <span className="mt-1.5 block text-xs text-muted-foreground">{help}</span>}
    </label>
  )
}

function EmptyMedia({ kind }: { kind: 'image' | 'video' | 'embed' | 'audio' }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'audio' ? AudioLines : kind === 'embed' ? Code2 : LayoutGrid
  const labels = { image: 'Adicione uma imagem', video: 'Adicione um vídeo', embed: 'Adicione uma URL', audio: 'Adicione um áudio' }
  return (
    <div className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground">
      <Icon className="size-6" />
      <span className="text-xs font-medium">{labels[kind]}</span>
    </div>
  )
}

export function ElementView({
  element,
  breakpoint,
  children,
}: {
  element: FunnelElement
  breakpoint: Breakpoint
  children?: ReactNode
}) {
  const style = resolveElementStyles(element, breakpoint)
  const css = elementStyleToCss(style)
  const placeholder = contentString(element, 'placeholder')

  switch (element.type) {
    case 'section':
      return <section style={css} className="mx-auto w-full">{children}</section>
    case 'container':
      return <div style={css} className="mx-auto">{children}</div>
    case 'spacer':
      return <div aria-hidden style={{ height: contentNumber(element, 'height', style.minHeight ?? 40), ...css }} />
    case 'divider':
      return <hr style={{ borderColor: style.borderColor, borderWidth: style.borderWidth ?? 1 }} className="w-full border-x-0 border-b-0" />
    case 'heading':
      return <h2 style={css}>{contentString(element, 'text', 'Seu título')}</h2>
    case 'text':
      return <p style={css} className="whitespace-pre-wrap">{contentString(element, 'text', 'Seu texto')}</p>
    case 'image': {
      const src = safeUrl(element.content.src, true)
      if (!src) return <EmptyMedia kind="image" />
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={contentString(element, 'alt', '')} style={css} className="block" />
    }
    case 'video': {
      const src = videoEmbedUrl(element.content.src)
      if (!src) return <EmptyMedia kind="video" />
      if (/\.(mp4|webm|ogg)(\?|$)/i.test(src)) {
        return <video controls src={src} aria-label={contentString(element, 'title', 'Vídeo')} style={css} className="block w-full" />
      }
      return <iframe src={src} title={contentString(element, 'title', 'Vídeo')} style={css} className="block w-full" sandbox="allow-scripts allow-presentation" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    }
    case 'button':
      return (
        <button type="button" style={css} className="inline-flex cursor-pointer items-center justify-center gap-2 transition hover:brightness-110">
          {contentString(element, 'text', 'Continuar')}
          <MousePointerClick className="size-4 opacity-60" />
        </button>
      )
    case 'icon':
      return (
        <div style={css} aria-label={contentString(element, 'label', 'Ícone')}>
          <FunnelIcon name={element.content.icon} className="mx-auto size-[1em]" />
        </div>
      )
    case 'embed': {
      const url = safeUrl(element.content.url)
      if (!url) return <EmptyMedia kind="embed" />
      return <iframe src={url} title={contentString(element, 'title', 'Conteúdo incorporado')} style={css} className="block w-full" sandbox="allow-scripts allow-forms allow-popups" />
    }
    case 'audio': {
      const src = safeUrl(element.content.src)
      if (!src) return <EmptyMedia kind="audio" />
      return <audio controls src={src} style={css} className="w-full" aria-label={contentString(element, 'title', 'Áudio')} />
    }
    case 'short_text':
      return <FieldShell element={element}><input type="text" className={inputClass} placeholder={placeholder} /></FieldShell>
    case 'email':
      return <FieldShell element={element}><input type="email" className={inputClass} placeholder={placeholder} /></FieldShell>
    case 'phone':
      return <FieldShell element={element}><input type="tel" className={inputClass} placeholder={placeholder} /></FieldShell>
    case 'number':
      return <FieldShell element={element}><input type="number" min={contentNumber(element, 'min', 0)} max={contentNumber(element, 'max', 100)} className={inputClass} placeholder={placeholder} /></FieldShell>
    case 'date':
      return <FieldShell element={element}><input type="date" className={inputClass} /></FieldShell>
    case 'select':
      return (
        <FieldShell element={element}>
          <select className={inputClass} defaultValue="">
            <option value="" disabled>{placeholder || 'Escolha...'}</option>
            {normalizeFunnelOptions(element.content.options).map((option) => <option key={option.value}>{option.label}</option>)}
          </select>
        </FieldShell>
      )
    case 'checkbox':
      return (
        <FieldShell element={element} group>
          <div className="grid gap-2">
            {normalizeFunnelOptions(element.content.options).map((option) => (
              <label key={option.value} className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-sm text-muted-foreground">
                <input type="checkbox" className="size-4 accent-violet-500" /> {option.label}
              </label>
            ))}
          </div>
        </FieldShell>
      )
    case 'radio':
      return (
        <FieldShell element={element} group>
          <div className="grid gap-2">
            {normalizeFunnelOptions(element.content.options).map((option) => (
              <label key={option.value} className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-sm text-muted-foreground">
                <input type="radio" name={element.id} className="size-4 accent-violet-500" /> {option.label}
              </label>
            ))}
          </div>
        </FieldShell>
      )
    case 'upload':
      return (
        <FieldShell element={element}>
          <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-muted-foreground">
            <FileUp className="size-5" />
            <span className="text-xs">Clique ou arraste um arquivo</span>
            <input type="file" className="sr-only" accept={contentString(element, 'accept')} />
          </div>
        </FieldShell>
      )
    case 'quiz_choice':
      return (
        <div style={css} className="w-full">
          <FieldShell element={element} group>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={contentString(element, 'label', 'Escolha uma resposta')}>
              {normalizeFunnelOptions(element.content.options).map((option) => (
                <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/20 px-3.5 text-sm text-muted-foreground transition hover:border-violet-400/30 hover:bg-violet-500/[0.06]">
                  <input type="radio" name={element.id} value={option.value} className="size-4" style={{ accentColor: style.accentColor ?? '#8b5cf6' }} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </FieldShell>
        </div>
      )
    case 'slider': {
      const min = contentNumber(element, 'min', 0)
      const max = Math.max(min, contentNumber(element, 'max', 10))
      const step = Math.max(0.01, contentNumber(element, 'step', 1))
      return (
        <div style={css} className="w-full">
          <FieldShell element={element}>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                defaultValue={min}
                aria-label={contentString(element, 'label', 'Escolha um valor')}
                className="w-full"
                style={{ accentColor: style.accentColor ?? '#8b5cf6' }}
              />
              {contentBoolean(element, 'showValue', true) && (
                <output className="min-w-12 rounded-lg border border-border px-2 py-1 text-center font-mono text-sm">{min}</output>
              )}
            </div>
          </FieldShell>
        </div>
      )
    }
    case 'rating': {
      const max = Math.max(1, Math.min(10, Math.round(contentNumber(element, 'max', 5))))
      return (
        <div style={css} className="w-full">
          <FieldShell element={element} group>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: max }, (_, index) => index + 1).map((rating) => (
                <button type="button" key={rating} aria-pressed="false" aria-label={`${rating} de ${max} estrelas`} className="rounded-md p-0.5 text-muted-foreground/60 transition hover:text-amber-400 focus-visible:outline-2 focus-visible:outline-amber-400">
                  <Star className="size-7" style={{ color: style.accentColor ?? '#fbbf24' }} />
                </button>
              ))}
            </div>
          </FieldShell>
        </div>
      )
    }
    case 'progress': {
      const progress = Math.max(0, Math.min(100, contentNumber(element, 'value', 40)))
      const label = contentString(element, 'label', 'Progresso')
      return (
        <div style={css} className="w-full">
          <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: style.accentColor ?? '#8b5cf6' }} />
          </div>
          {contentBoolean(element, 'showValue', true) && <span className="mt-2 block text-right text-xs opacity-60">{progress}%</span>}
        </div>
      )
    }
    case 'countdown': {
      const totalSeconds = Math.max(0, Math.round(contentNumber(element, 'minutes', 15) * 60))
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      return (
        <div style={css} className="w-full">
          <Clock3 className="mx-auto mb-3 size-5 opacity-60" aria-hidden="true" />
          {contentString(element, 'label') && <p className="mb-3 text-sm font-semibold">{contentString(element, 'label')}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2" role="timer" aria-label={`${hours} horas, ${minutes} minutos e ${seconds} segundos restantes`}>
            {[hours, minutes, seconds].map((part, index) => (
              <div key={index} className="min-w-16 rounded-xl border border-border bg-muted/40 px-3 py-3 text-center">
                <strong className="font-mono text-xl tabular-nums">{String(part).padStart(2, '0')}</strong>
                {contentBoolean(element, 'showLabels', true) && <span className="mt-1 block text-[9px] uppercase tracking-widest opacity-50">{['horas', 'min', 'seg'][index]}</span>}
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'accordion':
    case 'faq': {
      const items = contentItems(element)
      return (
        <section style={css} className="w-full">
          {contentString(element, 'title') && <h2 className="mb-5 text-2xl font-bold">{contentString(element, 'title')}</h2>}
          <div className="grid w-full gap-2">
            {items.map((item, index) => (
              <details key={`${item.title}-${index}`} className="group rounded-xl border border-border bg-muted/20 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                  {item.title || `Item ${index + 1}`}
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 opacity-65">{item.text}</p>
              </details>
            ))}
          </div>
        </section>
      )
    }
    case 'offer':
      return (
        <section style={css} className="w-full">
          {contentString(element, 'eyebrow') && (
            <span className="inline-flex rounded-full px-3 py-1 text-xs font-bold" style={{ color: style.accentColor ?? '#a78bfa', backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
              {contentString(element, 'eyebrow')}
            </span>
          )}
          <h2 className="mt-4 text-3xl font-extrabold leading-tight">{contentString(element, 'title', 'Sua oferta')}</h2>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed opacity-65">{contentString(element, 'text')}</p>
        </section>
      )
    case 'price': {
      const features = contentStrings(element, 'features')
      return (
        <section style={css} className="mx-auto w-full">
          <p className="text-sm font-semibold opacity-65">{contentString(element, 'name', 'Plano')}</p>
          <div className="mt-2 flex flex-wrap items-baseline justify-center gap-1.5">
            <strong className="text-4xl font-extrabold">{contentString(element, 'price', 'R$ 0')}</strong>
            <span className="text-xs opacity-50">{contentString(element, 'period')}</span>
          </div>
          {contentString(element, 'description') && <p className="mt-3 text-sm leading-6 opacity-60">{contentString(element, 'description')}</p>}
          {features.length > 0 && (
            <ul className="mt-5 grid gap-2 text-left text-sm">
              {features.map((feature, index) => <li key={`${feature}-${index}`} className="flex items-center gap-2"><Check aria-hidden="true" className="size-4 shrink-0" style={{ color: style.accentColor ?? '#8b5cf6' }} />{feature}</li>)}
            </ul>
          )}
        </section>
      )
    }
    case 'testimonial': {
      const avatar = contentString(element, 'avatar')
      return (
        <figure style={css} className="w-full">
          <Quote aria-hidden="true" className="size-6" style={{ color: style.accentColor ?? '#8b5cf6' }} />
          <blockquote className="mt-4 whitespace-pre-wrap text-lg leading-8">“{contentString(element, 'quote')}”</blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-9 rounded-full object-cover" />
            ) : <CircleUserRound aria-hidden="true" className="size-9 opacity-40" />}
            <span className="text-left"><strong className="block text-sm">{contentString(element, 'author')}</strong><span className="text-xs opacity-50">{contentString(element, 'role')}</span></span>
          </figcaption>
        </figure>
      )
    }
    case 'benefits': {
      const benefits = contentStrings(element, 'items')
      return (
        <section style={css} className="w-full text-left">
          <h2 className="text-2xl font-bold">{contentString(element, 'title')}</h2>
          <ul className="mt-5 grid gap-3">
            {benefits.map((benefit, index) => (
              <li key={`${benefit}-${index}`} className="flex items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/12"><Check aria-hidden="true" className="size-3.5 text-emerald-400" /></span>
                {benefit}
              </li>
            ))}
          </ul>
        </section>
      )
    }
    case 'cta':
      return (
        <section style={css} className="w-full">
          <BadgeCheck aria-hidden="true" className="mx-auto size-7" style={{ color: style.accentColor ?? '#8b5cf6' }} />
          <h2 className="mt-4 text-2xl font-extrabold">{contentString(element, 'title')}</h2>
          <p className="mt-2 whitespace-pre-wrap opacity-65">{contentString(element, 'text')}</p>
          <button type="button" className="mt-5 min-h-11 rounded-xl px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: style.accentColor ?? '#7c3aed' }}>
            {contentString(element, 'buttonText', 'Continuar')}
          </button>
        </section>
      )
    case 'social_proof':
      return (
        <section style={css} className="w-full">
          <strong className="block text-4xl font-extrabold" style={{ color: style.accentColor ?? '#a78bfa' }}>{contentString(element, 'value')}</strong>
          <span className="mt-2 block text-sm opacity-65">{contentString(element, 'label')}</span>
          {contentString(element, 'supportingText') && <p className="mt-2 text-xs opacity-45">{contentString(element, 'supportingText')}</p>}
        </section>
      )
    case 'logo_cloud': {
      const logos = contentStrings(element, 'logos')
      return (
        <section style={css} className="w-full">
          <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-45">{contentString(element, 'title')}</p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-3" aria-label={contentString(element, 'title', 'Marcas parceiras')}>
            {logos.map((logo, index) => {
              const logoUrl = /^(?:https?:\/\/|data:image\/)/i.test(logo) ? logo : ''
              return (
                <li key={`${logo}-${index}`} className="grid min-h-12 min-w-24 place-items-center rounded-xl border border-border bg-muted/20 px-5 py-3 text-sm font-bold opacity-60">
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
    }
    default:
      return null
  }
}
