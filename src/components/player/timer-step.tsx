'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Countdown urgency screen — the timer starts fresh every time this step is
// reached (not tied to a fixed deadline), so it works the same for every
// visitor regardless of when they arrive. Reaching zero doesn't block
// anything; it just reads as "urgent" via the reddened digits, matching how
// scarcity timers are used elsewhere in quiz funnels (perceived pressure,
// not a hard cutoff the visitor could get locked out by).
export function TimerStep({
  title,
  body,
  durationSeconds,
  ctaLabel,
  onContinue,
  accentColor,
}: {
  title: string
  body?: string
  durationSeconds: number
  ctaLabel?: string
  onContinue: () => void
  accentColor?: string
}) {
  const [remaining, setRemaining] = useState(durationSeconds)

  useEffect(() => {
    if (remaining <= 0) return
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [remaining])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const isUrgent = remaining <= 60

  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300 text-center">
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
        isUrgent
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      }`}>
        <Flame className="h-3.5 w-3.5" /> Oferta por tempo limitado
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{title}</h2>

      {body && <p className="text-zinc-300 text-sm leading-relaxed">{body}</p>}

      <div
        className={`font-mono text-4xl sm:text-5xl font-bold tabular-nums tracking-tight ${
          isUrgent ? 'text-red-400' : 'text-white'
        }`}
      >
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>

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
