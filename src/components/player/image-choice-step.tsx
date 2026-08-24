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
  imageShape,
}: {
  options: Option[]
  selectedOptionId?: string
  onSelect: (option: Option) => void
  accentColor?: string
  imageShape?: 'square' | 'circle'
}) {
  const isCircle = imageShape === 'circle'

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
                : 'border-border hover:border-muted-foreground/40'
            }`}
          >
            <div className={`aspect-square bg-muted overflow-hidden ${isCircle ? 'p-3' : ''}`}>
              {opt.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={opt.image_url}
                  alt={opt.text}
                  className={`h-full w-full object-cover transition ${isCircle ? 'rounded-full' : ''} ${isSelected ? '' : 'group-hover:scale-105'}`}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground/60 text-xs">
                  Sem imagem
                </div>
              )}
            </div>
            <div
              style={isSelected && accentColor ? { backgroundColor: `${accentColor}26` } : undefined}
              className={`p-2.5 text-center text-sm font-medium ${isSelected ? 'bg-indigo-600/15 text-foreground' : 'bg-muted/40 text-muted-foreground'}`}
            >
              {opt.text}
            </div>
          </button>
        )
      })}
    </div>
  )
}
