'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChartBar {
  label: string
  value: number
}

// Simple horizontal bar chart — used to back a claim with a statistic (e.g.
// "68% of people like you..."). Pure CSS, no charting library: values are
// normalized against the largest bar so the comparison reads correctly even
// if all values are well under 100.
export function ChartStep({
  title,
  body,
  bars,
  unit = '',
  onContinue,
  accentColor,
  barStyle = 'gradient',
}: {
  title: string
  body?: string
  bars: ChartBar[]
  unit?: string
  onContinue: () => void
  accentColor?: string
  barStyle?: 'gradient' | 'solid'
}) {
  const maxValue = Math.max(1, ...bars.map((b) => b.value))
  const isSolid = barStyle === 'solid' || !!accentColor

  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{title}</h2>
        {body && <p className="text-zinc-400 text-xs sm:text-sm">{body}</p>}
      </div>

      <div className="space-y-4 pt-1">
        {bars.map((bar, idx) => {
          const widthPct = Math.max(4, Math.round((bar.value / maxValue) * 100))
          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-zinc-300 font-medium" title={bar.label}>{bar.label}</span>
                <span className="shrink-0 text-indigo-400 font-mono font-semibold tabular-nums" style={accentColor ? { color: accentColor } : undefined}>
                  {bar.value}{unit}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isSolid ? '' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'}`}
                  style={{ width: `${widthPct}%`, ...(isSolid ? { background: accentColor || '#6366f1' } : {}) }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        onClick={onContinue}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
      >
        Continuar <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
