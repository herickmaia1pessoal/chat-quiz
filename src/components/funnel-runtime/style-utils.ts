import type { CSSProperties } from 'react'
import type { StyleProperties } from '@/lib/funnel'

const shadows: Record<NonNullable<StyleProperties['shadow']>, string | undefined> = {
  none: 'none',
  sm: '0 4px 12px rgba(0,0,0,.18)',
  md: '0 12px 30px rgba(0,0,0,.24)',
  lg: '0 24px 60px rgba(0,0,0,.34)',
  glow: '0 0 35px color-mix(in srgb, currentColor 24%, transparent)',
}

export function toReactStyle(style: StyleProperties): CSSProperties {
  const alignMap = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const
  const justifyMap = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const

  return {
    display: style.columns ? 'grid' : style.display,
    flexDirection: style.flexDirection,
    alignItems: style.alignItems ? alignMap[style.alignItems] : undefined,
    justifyContent: style.justifyContent ? justifyMap[style.justifyContent] : undefined,
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
    borderStyle: style.borderWidth ? 'solid' : undefined,
    borderWidth: style.borderWidth,
    borderRadius: style.borderRadius,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    opacity: style.opacity,
    boxShadow: style.shadow ? shadows[style.shadow] : undefined,
    objectFit: style.objectFit,
  }
}

export function safeUrl(value: unknown, allowDataImage = false) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const candidate = value.trim()
  if (allowDataImage && candidate.startsWith('data:image/')) return candidate
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

export function videoEmbedUrl(value: unknown) {
  const url = safeUrl(value)
  if (!url) return ''
  const parsed = new URL(url)

  if (parsed.hostname.includes('youtube.com')) {
    const id = parsed.searchParams.get('v')
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
  }

  if (parsed.hostname === 'youtu.be') {
    const id = parsed.pathname.slice(1)
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
  }

  if (parsed.hostname.includes('vimeo.com')) {
    const id = parsed.pathname.split('/').filter(Boolean).at(-1)
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
  }

  return url
}
