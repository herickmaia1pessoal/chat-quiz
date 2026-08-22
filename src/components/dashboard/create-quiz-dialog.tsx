'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
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
import { createQuiz } from '@/app/dashboard/actions'

export function CreateQuizDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setError(null)
      setTitle('')
      setDescription('')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !workspaceId) return

    setLoading(true)
    setError(null)
    try {
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
      setError('Erro ao criar quiz. Tente novamente.')
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
      <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-[480px]">
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Criar Novo Quiz</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Configure as informações básicas do seu quiz interativo de alta conversão.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quizTitle" className="text-zinc-300">
                Título do Quiz
              </Label>
              <Input
                id="quizTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Descubra o tratamento ideal para sua pele"
                className="border-zinc-700 bg-zinc-950 text-zinc-100"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quizDesc" className="text-zinc-300">
                Descrição ou Objetivo (opcional)
              </Label>
              <Textarea
                id="quizDesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Funil focado em campanha de Meta Ads com foco em CPL reduzido."
                className="border-zinc-700 bg-zinc-950 text-zinc-100 resize-none h-20"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading ? 'Criando...' : 'Continuar para o Builder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
