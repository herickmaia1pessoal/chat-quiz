'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2 } from 'lucide-react'
import { duplicateQuiz } from '@/app/dashboard/actions'

export function DuplicateQuizButton({ quizId }: { quizId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleDuplicate = async () => {
    setLoading(true)
    try {
      const copy = await duplicateQuiz(quizId)
      router.push(`/dashboard/quiz/${copy.id}`)
    } catch (err) {
      console.error(err)
      alert('Erro ao duplicar quiz. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDuplicate}
      disabled={loading}
      className="py-2 px-3 rounded-lg border border-border hover:bg-accent text-foreground text-xs font-medium transition flex items-center justify-center gap-1 disabled:opacity-50"
      title="Duplicar quiz"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
