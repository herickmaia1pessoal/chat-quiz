'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

// Floating "so-and-so just did X" notification — unlike every other narrative
// block, this one doesn't occupy the main stage or have its own CTA. It
// appears as a toast in the corner for a few seconds while the step it's
// attached to is on screen, then the step itself auto-advances (the parent
// treats it like a content block with no user input needed), matching how
// Inlead's own "Notificação" block behaves as ambient decoration rather than
// a stop-and-read screen.
export function SocialProofToast({
  name,
  action,
  timeLabel,
  position = 'bottom-left',
}: {
  name?: string
  action?: string
  timeLabel?: string
  position?: 'bottom-left' | 'bottom-right'
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 400)
    const hideTimer = setTimeout(() => setVisible(false), 5400)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!name && !action) return null

  const sideClasses = position === 'bottom-right'
    ? 'bottom-5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0'
    : 'bottom-5 left-1/2 -translate-x-1/2 sm:left-5 sm:translate-x-0'

  return (
    <div
      className={`fixed ${sideClasses} z-50 transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-xl shadow-2xl px-4 py-3 max-w-xs">
        <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-200 leading-snug">
            <span className="font-semibold">{name}</span>{' '}
            <span className="text-zinc-400">{action}</span>
          </p>
          {timeLabel && <p className="text-[10px] text-zinc-500 mt-0.5">{timeLabel}</p>}
        </div>
      </div>
    </div>
  )
}
