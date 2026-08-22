'use client'

interface Option {
  id: string
  text: string
  order_num?: number
}

// Five-point agreement scale (Concordo totalmente → Discordo totalmente).
// Visually distinct from plain multiple choice — no A/B/C markers, since the
// order itself carries meaning (a spectrum, not an arbitrary list) — and the
// selected option's position hints at where it sits on that spectrum via color.
export function LikertStep({
  options,
  selectedOptionId,
  onSelect,
  accentColor,
  optionsLayout,
}: {
  options: Option[]
  selectedOptionId?: string
  onSelect: (option: Option) => void
  accentColor?: string
  optionsLayout?: 'list' | 'grid'
}) {
  return (
    <div className={optionsLayout === 'grid' ? 'grid grid-cols-2 gap-2 pt-2' : 'space-y-2 pt-2'}>
      {options.map((opt, idx) => {
        const isSelected = selectedOptionId === opt.id
        // Tint from agreement (emerald) to disagreement (amber) across the
        // 5 positions, purely as a visual spectrum cue — not a value judgment.
        const position = options.length > 1 ? idx / (options.length - 1) : 0
        const dotColor = position < 0.4 ? 'bg-emerald-500' : position > 0.6 ? 'bg-amber-500' : 'bg-zinc-500'

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            style={isSelected && accentColor ? { borderColor: accentColor } : undefined}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
              isSelected
                ? 'border-indigo-500 bg-indigo-600/15 text-white shadow-md shadow-indigo-500/10'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/80'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
            <span className="text-sm font-medium">{opt.text}</span>
          </button>
        )
      })}
    </div>
  )
}
