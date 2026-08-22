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
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-zinc-800 text-zinc-400 border-zinc-700') +
        (className ? ` ${className}` : '')
      }
    >
      {isPublished ? 'Publicado' : 'Rascunho'}
    </Badge>
  )
}
