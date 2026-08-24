'use client'

import { useState } from 'react'
import { CheckCircle2, Clock3, History, LoaderCircle, RotateCcw } from 'lucide-react'
import { restoreFunnelVersion } from '@/app/dashboard/funnels/actions'
import type { FunnelVersionRecord } from './types'

const kindLabel = {
  draft: 'Rascunho',
  published: 'Publicada',
  restored: 'Restaurada',
} as const

export function FunnelVersionHistory({
  funnelId,
  currentRevision,
  versions,
  confirmRestore,
}: {
  funnelId: string
  currentRevision: number
  versions: FunnelVersionRecord[]
  confirmRestore?: () => boolean
}) {
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const restore = async (version: FunnelVersionRecord) => {
    if (confirmRestore && !confirmRestore()) return
    if (!window.confirm(`Restaurar a versão ${version.versionNumber} como um novo rascunho?`)) return
    setRestoringId(version.id)
    setFeedback('')
    try {
      await restoreFunnelVersion(funnelId, version.id, currentRevision)
      setFeedback('Versão restaurada. Recarregando o novo rascunho...')
      window.location.reload()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível restaurar esta versão.')
      setRestoringId(null)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-400/10 bg-violet-500/[0.08] text-violet-600"><History className="size-4" /></span>
          <div>
            <h2 className="text-sm font-bold text-foreground">Histórico de versões</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground/50">Restaurar cria um novo rascunho; a publicação ativa permanece intacta.</p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-[10px] font-semibold text-muted-foreground">Revisão atual {currentRevision}</span>
      </div>

      {feedback && <p role="status" className="mt-4 rounded-xl border border-violet-400/15 bg-violet-500/[0.05] px-3.5 py-3 text-xs text-violet-700/80">{feedback}</p>}

      {versions.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground/60">Nenhuma versão registrada.</div>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {versions.map((version, index) => (
            <div key={version.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${version.kind === 'published' ? 'bg-emerald-400/[0.08] text-emerald-600' : 'bg-muted text-muted-foreground/50'}`}>
                {version.kind === 'published' ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Versão {version.versionNumber}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">{kindLabel[version.kind]}</span>
                  {index === 0 && <span className="rounded-full bg-violet-500/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-600">Mais recente</span>}
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground/50">{version.label || `Revisão ${version.revision}`} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</p>
              </div>
              <button
                type="button"
                disabled={restoringId !== null || index === 0}
                onClick={() => void restore(version)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-3 text-[10px] font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                {restoringId === version.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
