'use client'

interface Option {
  id: string
  text: string
  order_num?: number
  image_url?: string
}

// Card-with-image variant of multiple choice — used for the opening
// segmentation question in the reference funnel (e.g. "Homem / Mulher"
// with a photo per option), where a plain text list reads too flat.
export function ImageChoiceStep({
  options,
  selectedOptionId,
  onSelect,
  accentColor,
}: {
  options: Option[]
  selectedOptionId?: string
  onSelect: (option: Option) => void
  accentColor?: string
}) {
  return (
    <div className={`grid gap-3 pt-2 ${options.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {options.map((opt) => {
        const isSelected = selectedOptionId === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            style={isSelected && accentColor ? { borderColor: accentColor } : undefined}
            className={`rounded-2xl border overflow-hidden transition-all text-left group ${
              isSelected
                ? 'border-indigo-500 shadow-md shadow-indigo-500/10'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="aspect-square bg-zinc-900 overflow-hidden">
              {opt.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={opt.image_url}
                  alt={opt.text}
                  className={`h-full w-full object-cover transition ${isSelected ? '' : 'group-hover:scale-105'}`}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-zinc-700 text-xs">
                  Sem imagem
                </div>
              )}
            </div>
            <div
              style={isSelected && accentColor ? { backgroundColor: `${accentColor}26` } : undefined}
              className={`p-2.5 text-center text-sm font-medium ${isSelected ? 'bg-indigo-600/15 text-white' : 'bg-zinc-950/60 text-zinc-300'}`}
            >
              {opt.text}
            </div>
          </button>
        )
      })}
    </div>
  )
}
