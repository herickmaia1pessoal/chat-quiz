import { Badge } from '@/components/ui/badge'

// Single source of truth for the published/draft badge styling — this
// exact class pair was previously duplicated (and could silently drift)
// across the dashboard list, the quiz builder header, and anywhere else
// a quiz's status needs to be shown at a glance.
export function QuizStatusBadge({ status, className }: { status: string; className?: string }) {
  const isPublished = status === 'published'

  return (
    <Badge
      className={
        (isPublished
          ? 'border-emerald-300/30 bg-emerald-50 text-emerald-600'
          : 'border-amber-300/30 bg-amber-50 text-amber-600') +
        (className ? ` ${className}` : '')
      }
    >
      {isPublished ? 'Publicado' : 'Rascunho'}
    </Badge>
  )
}
