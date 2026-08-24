'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { exportQuizAsJson } from '@/app/dashboard/actions'

// Downloads the quiz as a .json file — same Blob + <a download> pattern
// already used for CSV exports elsewhere in the app, adapted for JSON.
export function ExportQuizButton({ quizId, quizTitle }: { quizId: string; quizTitle: string }) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const data = await exportQuizAsJson(quizId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const slug = quizTitle.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const a = document.createElement('a')
      a.href = url
      a.download = `quiz-${slug || quizId}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert('Erro ao exportar quiz. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      title="Exportar quiz (.json)"
      className="py-2 px-3 rounded-lg border border-border hover:bg-accent text-foreground text-xs font-medium transition flex items-center justify-center gap-1 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </button>
  )
}
