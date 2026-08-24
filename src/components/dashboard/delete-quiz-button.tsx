'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, Check, X } from 'lucide-react'
import { deleteQuiz } from '@/app/dashboard/actions'

// Two-step confirm inline (same pattern used for deleting a question in the
// builder) rather than a native confirm() dialog or a separate modal —
// keeps the action reachable in one click-then-click on the card itself,
// while still requiring a deliberate second tap before anything irreversible
// happens (this permanently removes the quiz's leads/answers via cascade).
export function DeleteQuizButton({ quizId, quizTitle }: { quizId: string; quizTitle: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    try {
      await deleteQuiz(quizId)
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Erro ao excluir quiz.')
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          title={`Confirmar exclusão de "${quizTitle}"`}
          className="p-2 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          title="Cancelar"
          className="p-2 rounded-lg border border-border hover:bg-accent text-muted-foreground transition disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Excluir quiz"
        className="py-2 px-3 rounded-lg border border-border hover:border-red-500/40 hover:bg-red-500/10 text-foreground hover:text-red-600 text-xs font-medium transition flex items-center justify-center gap-1"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </>
  )
}
