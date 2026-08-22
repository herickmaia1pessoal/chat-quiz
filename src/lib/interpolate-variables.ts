// Lets quiz text reference data captured earlier in the same session — the
// lead's name/phone once past the capture gate, or an earlier answer by
// question position — so a later screen can say "Olá, {{nome}}" or echo
// back what someone picked in question 2. Placeholders that have no value
// yet (e.g. {{nome}} before the lead capture step) are left as literal text
// rather than rendered blank, so an author previewing mid-quiz sees the
// placeholder instead of a silently empty sentence.

export interface InterpolationContext {
  leadName?: string
  leadPhone?: string
  leadEmail?: string
  // 1-indexed by the question's position among *answerable* questions —
  // matches the numbering shown next to each question in the builder, not
  // the raw array index (which would also count content/comparison blocks).
  answersByPosition: Record<number, string>
}

const PLACEHOLDER_PATTERN = /\{\{\s*(nome|telefone|email|resposta_(\d+))\s*\}\}/g

export function interpolateVariables(text: string | undefined | null, ctx: InterpolationContext): string {
  if (!text) return ''

  return text.replace(PLACEHOLDER_PATTERN, (match, key: string, respostaIndex?: string) => {
    if (key === 'nome') return ctx.leadName || match
    if (key === 'telefone') return ctx.leadPhone || match
    if (key === 'email') return ctx.leadEmail || match
    if (respostaIndex) {
      const value = ctx.answersByPosition[Number(respostaIndex)]
      return value || match
    }
    return match
  })
}
