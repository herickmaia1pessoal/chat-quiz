'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, Loader2, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { listQuizVersions, restoreQuizVersion } from '@/app/dashboard/actions'

interface VersionRow {
  id: string
  created_at: string
  label: string | null
}

// Every successful save snapshots the quiz into quiz_versions (see
// saveQuestions/saveQuizVersion in src/app/dashboard/actions.ts). This
// dialog lists that history and lets the user jump back to an earlier
// snapshot — restoring itself also creates a new version, so a restore is
// never a one-way trip either.
export function VersionHistoryDialog({ quizId }: { quizId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [versions, setVersions] = useState<VersionRow[] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [restoredId, setRestoredId] = useState<string | null>(null)

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen)
    setConfirmingId(null)
    setRestoredId(null)
    if (nextOpen && versions === null) {
      setLoading(true)
      try {
        const data = await listQuizVersions(quizId)
        setVersions(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId)
    try {
      await restoreQuizVersion(quizId, versionId)
      setRestoredId(versionId)
      setConfirmingId(null)
      // The builder reads steps from the server on load — refresh so the
      // just-restored version actually shows up instead of the stale
      // in-memory state from before the restore.
      router.refresh()
      setTimeout(() => setOpen(false), 1200)
    } catch (err) {
      console.error(err)
      alert('Erro ao restaurar esta versão. Tente novamente.')
    } finally {
      setRestoringId(null)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant="outline"
        onClick={() => handleOpenChange(true)}
        className="border-border bg-card text-foreground hover:bg-accent gap-2">
        <History className="h-4 w-4 text-indigo-400" />
        Histórico
      </Button>
      <DialogContent className="!max-w-md bg-muted/50 border border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">Histórico de Versões</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Cada vez que você salva, uma versão é guardada. Restaurar aplica aquele estado imediatamente (e também vira uma nova versão).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma versão salva ainda. Elas aparecem aqui depois do primeiro "Salvar Alterações".
            </p>
          ) : (
            versions.map((v, idx) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div>
                  <p className="text-sm text-foreground">
                    {v.label || (idx === 0 ? 'Versão mais recente' : `Versão de ${formatDate(v.created_at)}`)}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">{formatDate(v.created_at)}</p>
                </div>

                {restoredId === v.id ? (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0">
                    <Check className="h-3.5 w-3.5" /> Restaurado
                  </span>
                ) : confirmingId === v.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button type="button" size="sm"
                      disabled={restoringId === v.id}
                      onClick={() => handleRestore(v.id)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
                      {restoringId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Confirmar
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setConfirmingId(null)}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent">
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm"
                    disabled={idx === 0}
                    title={idx === 0 ? 'Esta já é a versão atual' : 'Restaurar esta versão'}
                    onClick={() => setConfirmingId(v.id)}
                    className="border-border bg-card text-muted-foreground hover:bg-accent gap-1.5 shrink-0 disabled:opacity-40">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
