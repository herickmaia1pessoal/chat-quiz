'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ComparisonRow {
  label: string
  left_text: string
  right_text: string
}

// Two-column "before vs. after" table — contrasts the current state against
// the outcome, row by row. Uses semantic red/green rather than the brand
// accent since these columns represent risk vs. solution, not two neutral
// choices. The button briefly shows "Calculando..." before "Continuar",
// matching the pattern seen on the reference funnel (a beat of perceived
// processing before the CTA becomes actionable).
export function ComparisonStep({
  title,
  leftLabel,
  rightLabel,
  rows,
  onContinue,
  accentColor,
  leftColor,
  rightColor,
}: {
  title: string
  leftLabel: string
  rightLabel: string
  rows: ComparisonRow[]
  onContinue: () => void
  accentColor?: string
  leftColor?: string
  rightColor?: string
}) {
  const [calculating, setCalculating] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setCalculating(false), 1200)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="w-full rounded-3xl border border-border bg-card p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <h2 className="text-lg sm:text-xl font-bold text-foreground leading-snug text-center">{title}</h2>

      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2 text-center text-xs font-semibold py-2.5">
          <div className="break-words px-2 text-red-400 bg-red-500/5 border-r border-border" style={leftColor ? { color: leftColor, backgroundColor: `${leftColor}0d` } : undefined}>{leftLabel}</div>
          <div className="break-words px-2 text-emerald-500 bg-emerald-500/5" style={rightColor ? { color: rightColor, backgroundColor: `${rightColor}0d` } : undefined}>{rightLabel}</div>
        </div>
        <div className="divide-y divide-border">
          {rows.map((row, i) => (
            <div key={i}>
              <p className="break-words px-2 text-[10px] uppercase tracking-wide text-muted-foreground text-center pt-2 font-semibold">
                {row.label}
              </p>
              <div className="grid grid-cols-2 text-sm">
                <div className="break-words px-3 pb-2.5 pt-1 text-red-300/90 border-r border-border text-center" style={leftColor ? { color: leftColor } : undefined}>
                  {row.left_text}
                </div>
                <div className="break-words px-3 pb-2.5 pt-1 text-emerald-300/90 text-center" style={rightColor ? { color: rightColor } : undefined}>
                  {row.right_text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button
        type="button"
        onClick={onContinue}
        disabled={calculating}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
      >
        {calculating ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</>
        ) : (
          <>Continuar <ArrowRight className="h-4 w-4" /></>
        )}
      </Button>
    </div>
  )
}
