'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutTemplate, Loader2, ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createQuizFromTemplate } from '@/app/dashboard/template-actions'

interface Template {
  id: string
  name: string
  description: string
  category: string
  thumbnail_emoji: string
}

const categoryLabels: Record<string, { label: string; color: string }> = {
  skincare: { label: 'Skincare', color: 'bg-pink-500/10 text-pink-600 border-pink-500/20' },
  educacao: { label: 'Educação', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  marketing: { label: 'Marketing', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  geral: { label: 'Geral', color: 'bg-muted text-muted-foreground border-border' },
}

export function TemplatesDialog({
  workspaceId,
  templates,
}: {
  workspaceId: string
  templates: Template[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleUseTemplate = async (templateId: string) => {
    setLoadingId(templateId)
    try {
      const quiz = await createQuizFromTemplate(workspaceId, templateId)
      setOpen(false)
      router.push(`/dashboard/quiz/${quiz.id}`)
    } catch (err) {
      console.error(err)
      alert('Erro ao criar quiz a partir do template.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="border-border bg-card text-foreground hover:bg-accent gap-2"
          >
            <LayoutTemplate className="h-4 w-4 text-purple-500" />
            Usar Template
          </Button>
        }
      />
      <DialogContent className="border-border bg-card text-foreground sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">Templates de Quiz</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Comece com um funil pré-construído e personalize no builder. Economize tempo e aumente conversões.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-4 max-h-[60vh] overflow-y-auto pr-1">
          {templates.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhum template disponível. Execute a migração SQL da Fase 3.
            </p>
          ) : (
            templates.map((tpl) => {
              const catStyle = categoryLabels[tpl.category] || categoryLabels.geral
              const isLoading = loadingId === tpl.id
              return (
                <div
                  key={tpl.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/20 hover:border-border hover:bg-accent transition"
                >
                  <div className="h-12 w-12 rounded-xl bg-muted border border-border flex items-center justify-center text-2xl shrink-0">
                    {tpl.thumbnail_emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                      <Badge className={`text-[10px] ${catStyle.color}`}>{catStyle.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                  </div>
                  <Button
                    onClick={() => handleUseTemplate(tpl.id)}
                    disabled={isLoading || !!loadingId}
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>Usar <ArrowRight className="h-3.5 w-3.5" /></>
                    )}
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
