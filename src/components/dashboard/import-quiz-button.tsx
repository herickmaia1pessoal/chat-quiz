'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { importQuizFromJson } from '@/app/dashboard/actions'

// Reads a .json file picked via a hidden <input type="file">, parses it
// client-side, and hands the parsed object (not the raw file) to the
// server action — Server Actions can't take a File as a plain argument
// without going through FormData, and we already need the parsed shape to
// show a clear error before ever hitting the server if the file is junk.
export function ImportQuizButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    setLoading(true)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Arquivo inválido: não é um JSON válido.')
      }

      const newQuiz = await importQuizFromJson(workspaceId, parsed)
      router.push(`/dashboard/quiz/${newQuiz.id}`)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Erro ao importar quiz.')
      setLoading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="py-2.5 px-4 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-indigo-500" />}
        {loading ? 'Importando...' : 'Importar Quiz'}
      </button>
    </>
  )
}
