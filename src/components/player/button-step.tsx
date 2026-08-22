'use client'

import { ArrowRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Standalone CTA block — a bare button screen used to break up the flow
// (e.g. "continue where you left off") without asking anything. If a URL is
// set it navigates externally instead of advancing to the next quiz step.
export function ButtonStep({
  title,
  body,
  ctaLabel,
  url,
  openNewTab,
  onContinue,
  accentColor,
}: {
  title: string
  body?: string
  ctaLabel?: string
  url?: string
  openNewTab?: boolean
  onContinue: () => void
  accentColor?: string
}) {
  const isExternal = !!url
  const accentStyle = accentColor ? { backgroundColor: accentColor } : undefined

  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300 text-center">
      <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{title}</h2>

      {body && <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">{body}</p>}

      {isExternal ? (
        <a
          href={url}
          target={openNewTab ? '_blank' : undefined}
          rel={openNewTab ? 'noopener noreferrer' : undefined}
          style={accentStyle}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition"
        >
          {ctaLabel || 'Continuar'} <ExternalLink className="h-4 w-4" />
        </a>
      ) : (
        <Button
          type="button"
          onClick={onContinue}
          style={accentStyle}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
        >
          {ctaLabel || 'Continuar'} <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
