'use client'

import { useState } from 'react'
import { ArrowRight, Layers3, Loader2, Plus, Sparkles } from 'lucide-react'
import { createFunnel } from '@/app/dashboard/funnels/actions'
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
import { cn } from '@/lib/utils'

interface CreateFunnelDialogProps {
  workspaceId: string
  compact?: boolean
  initialName?: string
  triggerLabel?: string
}

export function CreateFunnelDialog({
  workspaceId,
  compact = false,
  initialName = '',
  triggerLabel = 'Novo funil',
}: CreateFunnelDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setError(null)
      setName(initialName)
      setDescription('')
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set('workspace_id', workspaceId)
      formData.set('name', name.trim())
      formData.set('description', description.trim())

      await createFunnel(formData)
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar o funil. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            className={cn(
              'gap-2 border border-violet-400/20 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_10px_35px_-14px_rgba(109,94,252,0.9)] hover:from-violet-500 hover:to-indigo-500',
              compact ? 'h-9 px-3 text-xs' : 'h-10 px-4 text-sm',
            )}
          >
            <Plus className="h-4 w-4" />
            {triggerLabel}
          </Button>
        }
      />

      <DialogContent className="overflow-hidden border-white/10 bg-[#0e0f16] p-0 text-zinc-100 shadow-2xl sm:max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <div className="relative border-b border-white/[0.07] px-6 pb-5 pt-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(124,58,237,0.16),transparent_48%)]" />
            <DialogHeader className="relative">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                  <Layers3 className="h-4 w-4" />
                </span>
                <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
                  Builder V2
                </span>
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-white">Crie um novo funil</DialogTitle>
              <DialogDescription className="max-w-md text-sm leading-relaxed text-zinc-400">
                Comece com uma página responsiva em branco. Depois, adicione seções, campos e regras no editor visual.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="funnel-name" className="text-xs font-semibold text-zinc-300">
                Nome do funil
              </Label>
              <Input
                id="funnel-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Diagnóstico da clínica"
                className="h-11 border-white/10 bg-black/25 text-zinc-100 placeholder:text-zinc-700 focus-visible:border-violet-400/50"
                required
                autoFocus
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="funnel-description" className="text-xs font-semibold text-zinc-300">
                  Objetivo
                </Label>
                <span className="text-[10px] uppercase tracking-wider text-zinc-700">Opcional</span>
              </div>
              <Textarea
                id="funnel-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Descreva a campanha ou o resultado esperado."
                className="min-h-24 resize-none border-white/10 bg-black/25 text-zinc-100 placeholder:text-zinc-700 focus-visible:border-violet-400/50"
                maxLength={280}
              />
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <p className="text-xs leading-relaxed text-zinc-400">
                O rascunho fica separado da versão publicada. Você pode experimentar à vontade antes de colocar alterações no ar.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="border-t border-white/[0.07] bg-black/15 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="gap-2 bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? 'Criando funil...' : 'Criar e abrir editor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
