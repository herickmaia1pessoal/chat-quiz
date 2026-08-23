// Shared normalization for `content.options` on choice-input element types
// (select, checkbox, radio, quiz_choice). Historically this field was a
// plain `string[]` — the label and the submitted value were the same
// string. It now also accepts a richer per-option shape that adds an
// optional lead-qualification tag, while staying fully backward compatible:
// a bare string is treated as `{ label: str, value: str }` with no tag.
export interface FunnelChoiceOption {
  label: string
  value: string
  tag?: string
}

export function normalizeFunnelOptions(raw: unknown): FunnelChoiceOption[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): FunnelChoiceOption[] => {
    if (typeof item === 'string') {
      const label = item.trim()
      return label ? [{ label, value: label }] : []
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const candidate = item as { label?: unknown; value?: unknown; tag?: unknown }
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : ''
    if (!label) return []
    const value = typeof candidate.value === 'string' && candidate.value.trim() ? candidate.value.trim() : label
    const tag = typeof candidate.tag === 'string' && candidate.tag.trim() ? candidate.tag.trim() : undefined
    return [{ label, value, ...(tag ? { tag } : {}) }]
  })
}

// Looks up the tag for whichever option(s) a runtime value matches — used
// both for a single value (select/radio/quiz_choice) and for an array of
// values (checkbox).
export function tagsForFunnelValue(options: FunnelChoiceOption[], value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const tags: string[] = []
  for (const raw of values) {
    const match = options.find((option) => option.value === raw)
    if (match?.tag && !tags.includes(match.tag)) tags.push(match.tag)
  }
  return tags
}
