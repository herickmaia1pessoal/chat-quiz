'use client'

import { ArrowRight, AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type AlertVariant = 'info' | 'warning' | 'success' | 'danger'

const VARIANT_STYLES: Record<AlertVariant, { icon: typeof Info; classes: string; iconColor: string }> = {
  info: { icon: Info, classes: 'bg-sky-500/10 border-sky-500/20 text-sky-300', iconColor: 'text-sky-400' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-500/10 border-amber-500/20 text-amber-200', iconColor: 'text-amber-400' },
  success: { icon: CheckCircle2, classes: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200', iconColor: 'text-emerald-400' },
  danger: { icon: XCircle, classes: 'bg-red-500/10 border-red-500/20 text-red-200', iconColor: 'text-red-400' },
}

// Highlighted banner interstitial — used to call out a risk, a reassurance,
// or a fact before the flow continues. Narrative only, like content/timer:
// nothing here is answered or scored.
export function AlertStep({
  title,
  body,
  variant = 'warning',
  onContinue,
}: {
  title: string
  body?: string
  variant?: AlertVariant
  onContinue: () => void
}) {
  const { icon: Icon, classes, iconColor } = VARIANT_STYLES[variant] || VARIANT_STYLES.warning

  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className={`rounded-2xl border p-4 flex gap-3 ${classes}`}>
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-bold leading-snug">{title}</h2>
          {body && <p className="text-sm leading-relaxed opacity-90 whitespace-pre-line">{body}</p>}
        </div>
      </div>

      <Button
        type="button"
        onClick={onContinue}
        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
      >
        Continuar <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
