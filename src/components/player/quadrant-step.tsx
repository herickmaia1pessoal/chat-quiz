'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QuadrantPoint {
  label: string
  x: number
  y: number
  highlighted?: boolean
}

// Cartesian X/Y plot — positions one or more points inside a square grid,
// used to show "where you land" on a two-axis profile (e.g. Introvert↔
// Extrovert vs. Reactive↔Strategic). Pure CSS positioning: x/y are 0-100,
// with y flipped so 0 sits at the bottom like a normal chart, not the top
// like raw CSS `top` would.
export function QuadrantStep({
  title,
  body,
  xLabel,
  yLabel,
  points,
  onContinue,
  accentColor,
  showGrid = true,
}: {
  title: string
  body?: string
  xLabel?: string
  yLabel?: string
  points: QuadrantPoint[]
  onContinue: () => void
  accentColor?: string
  showGrid?: boolean
}) {
  return (
    <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{title}</h2>
        {body && <p className="text-zinc-400 text-xs sm:text-sm">{body}</p>}
      </div>

      <div className="flex items-stretch gap-2">
        {yLabel && (
          <div className="flex items-center justify-center shrink-0 w-5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold [writing-mode:vertical-lr] rotate-180">
              {yLabel}
            </span>
          </div>
        )}

        <div className="flex-1 space-y-2">
          <div className="relative aspect-square w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
            {/* Grid lines */}
            {showGrid && (
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                <div className="border-r border-b border-zinc-800/60" />
                <div className="border-b border-zinc-800/60" />
                <div className="border-r border-zinc-800/60" />
                <div />
              </div>
            )}

            {points.map((point, idx) => (
              <div
                key={idx}
                className="absolute -translate-x-1/2 translate-y-1/2 flex flex-col items-center gap-1"
                style={{
                  left: `${Math.min(100, Math.max(0, point.x))}%`,
                  bottom: `${Math.min(100, Math.max(0, point.y))}%`,
                }}
              >
                <span
                  className={`h-3.5 w-3.5 rounded-full border-2 ${
                    point.highlighted
                      ? 'bg-indigo-500 border-indigo-300 shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-500/20'
                      : 'bg-zinc-700 border-zinc-600'
                  }`}
                  style={point.highlighted && accentColor ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
                />
                {point.label && (
                  <span className={`text-[10px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded ${
                    point.highlighted ? 'text-indigo-300 bg-indigo-950/80' : 'text-zinc-400 bg-zinc-900/80'
                  }`}>
                    {point.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {xLabel && (
        <p className="text-center text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
          {xLabel}
        </p>
      )}

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
