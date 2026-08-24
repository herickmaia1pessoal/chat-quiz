'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createQuiz, duplicateQuiz } from '@/app/dashboard/actions'

interface ExistingQuiz {
  id: string
  title: string
}

export function CreateQuizDialog({
  workspaceId,
  existingQuizzes = [],
}: {
  workspaceId: string
  existingQuizzes?: ExistingQuiz[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'scratch' | 'clone'>('scratch')
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cloneSourceId, setCloneSourceId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setError(null)
      setTitle('')
      setDescription('')
      setMode('scratch')
      setCloneSourceId('')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'clone') {
        if (!cloneSourceId) {
          setError('Escolha um quiz para clonar.')
          setLoading(false)
          return
        }
        const copy = await duplicateQuiz(cloneSourceId)
        setOpen(false)
        router.push(`/dashboard/quiz/${copy.id}`)
        return
      }

      if (!title.trim() || !workspaceId) return
      const formData = new FormData()
      formData.append('workspace_id', workspaceId)
      formData.append('title', title)
      formData.append('description', description)

      const quiz = await createQuiz(formData)
      setOpen(false)
      setTitle('')
      setDescription('')
      router.push(`/dashboard/quiz/${quiz.id}`)
    } catch (err) {
      console.error(err)
      setError(mode === 'clone' ? 'Erro ao clonar quiz. Tente novamente.' : 'Erro ao criar quiz. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-lg shadow-indigo-500/20">
            <Plus className="h-4 w-4" />
            Novo Quiz
          </Button>
        }
      />
      <DialogContent className="border-border bg-card text-foreground sm:max-w-[480px]">
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Criar Novo Quiz</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Comece do zero ou clone um quiz já existente como ponto de partida.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Mode toggle — only shown when there's actually something to clone */}
            {existingQuizzes.length > 0 && (
              <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('scratch')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition ${
                    mode === 'scratch' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Do zero
                </button>
                <button
                  type="button"
                  onClick={() => setMode('clone')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition ${
                    mode === 'clone' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Copy className="h-3.5 w-3.5" /> Clonar existente
                </button>
              </div>
            )}

            {mode === 'scratch' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="quizTitle" className="text-foreground">
                    Título do Quiz
                  </Label>
                  <Input
                    id="quizTitle"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Descubra o tratamento ideal para sua pele"
                    className="border-border bg-background text-foreground"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quizDesc" className="text-foreground">
                    Descrição ou Objetivo (opcional)
                  </Label>
                  <Textarea
                    id="quizDesc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Funil focado em campanha de Meta Ads com foco em CPL reduzido."
                    className="border-border bg-background text-foreground resize-none h-20"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label className="text-foreground">Escolha o quiz para clonar</Label>
                <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border border-border bg-muted/20 p-1.5">
                  {existingQuizzes.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCloneSourceId(q.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                        cloneSourceId === q.id
                          ? 'bg-indigo-600/15 border border-indigo-500/30 text-foreground'
                          : 'border border-transparent text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {q.title}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Cria uma cópia completa (etapas, blocos, ramificação e níveis de resultado) como rascunho novo.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-foreground hover:bg-accent"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || (mode === 'clone' && !cloneSourceId)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? (mode === 'clone' ? 'Clonando...' : 'Criando...') : 'Continuar para o Builder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
