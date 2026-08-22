'use client'

import { ArrowRight, Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Narrative interstitial screen — interrupts the question sequence to
// interpret the pattern so far and (optionally) show a testimonial, before
// a single "Continuar" CTA. Not a question: nothing here is answered or
// scored, it exists purely to build the case before the next question.
export function ContentInterstitial({
  title,
  body,
  testimonialText,
  testimonialAuthor,
  ctaLabel,
  onContinue,
  accentColor,
  cardStyle,
}: {
  title: string
  body?: string
  testimonialText?: string
  testimonialAuthor?: string
  ctaLabel?: string
  onContinue: () => void
  accentColor?: string
  cardStyle?: 'flat' | 'quote'
}) {
  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{title}</h2>

      {body && (
        <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">{body}</p>
      )}

      {testimonialText && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
          {cardStyle !== 'flat' && (
            <Quote className="h-4 w-4 text-indigo-400" style={accentColor ? { color: accentColor } : undefined} />
          )}
          <p className="text-zinc-300 text-sm italic leading-relaxed">{testimonialText}</p>
          {testimonialAuthor && (
            <p className="text-zinc-500 text-xs font-medium">— {testimonialAuthor}</p>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={onContinue}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
      >
        {ctaLabel || 'Continuar'} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
