'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FileJson,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  createFunnelFromTemplateV2,
  createTemplateFromFunnelV2,
  deleteFunnelV2,
  duplicateFunnelV2,
  exportFunnelV2,
  importFunnelV2,
  setFunnelArchivedV2,
} from '@/app/dashboard/funnels/actions'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ManagedFunnel {
  id: string
  name: string
  slug: string
  status: string
  publishedVersionId: string | null
}

function safeFileName(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'funil'
}

export function FunnelActionsMenu({ funnel }: { funnel: ManagedFunnel }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archived = funnel.status === 'archived'

  const run = async (name: string, operation: () => Promise<void>) => {
    setPending(name)
    setError(null)
    try {
      await operation()
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a operação.')
    } finally {
      setPending(null)
    }
  }

  const handleDuplicate = () => run('duplicate', async () => {
    const result = await duplicateFunnelV2(funnel.id)
    router.push(`/dashboard/funnels/${result.funnelId}`)
  })

  const handleArchive = () => run('archive', async () => {
    await setFunnelArchivedV2(funnel.id, !archived)
    router.refresh()
  })

  const handleExport = () => run('export', async () => {
    const payload = await exportFunnelV2(funnel.id)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeFileName(funnel.name)}.funnelflow-v2.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  })

  const handleTemplate = () => run('template', async () => {
    await createTemplateFromFunnelV2(funnel.id)
    router.refresh()
  })

  const handleDelete = () => run('delete', async () => {
    await deleteFunnelV2(funnel.id, confirmation)
    setDeleteOpen(false)
    router.refresh()
  })

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending !== null}
          render={
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50"
              aria-label={`Ações de ${funnel.name}`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            </button>
          }
        />
        <DropdownMenuContent
          align="end"
          className="w-56 border border-border bg-card p-1.5 text-foreground shadow-2xl"
        >
          <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer gap-2 px-2.5 py-2 text-xs focus:bg-accent focus:text-foreground">
            <Copy className="h-3.5 w-3.5 text-violet-600" /> Duplicar estrutura
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport} className="cursor-pointer gap-2 px-2.5 py-2 text-xs focus:bg-accent focus:text-foreground">
            <Download className="h-3.5 w-3.5 text-cyan-600" /> Exportar JSON V2
          </DropdownMenuItem>
          {funnel.publishedVersionId && (
            <DropdownMenuItem onClick={handleTemplate} className="cursor-pointer gap-2 px-2.5 py-2 text-xs focus:bg-accent focus:text-foreground">
              <LayoutTemplate className="h-3.5 w-3.5 text-emerald-600" /> Salvar como template
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem onClick={handleArchive} className="cursor-pointer gap-2 px-2.5 py-2 text-xs focus:bg-accent focus:text-foreground">
            {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            {archived ? 'Desarquivar como rascunho' : 'Arquivar e tirar do ar'}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setConfirmation('')
              setError(null)
              setDeleteOpen(true)
            }}
            className="cursor-pointer gap-2 px-2.5 py-2 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir permanentemente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {error && !deleteOpen && (
        <p role="alert" className="absolute right-0 top-11 z-40 w-64 rounded-lg border border-red-500/20 bg-card px-3 py-2 text-[11px] leading-relaxed text-red-600 shadow-xl">
          {error}
        </p>
      )}

      <Dialog open={deleteOpen} onOpenChange={(open) => !pending && setDeleteOpen(open)}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Excluir “{funnel.name}”?</DialogTitle>
            <DialogDescription className="leading-relaxed text-muted-foreground">
              Esta ação remove páginas, versões, sessões, leads e métricas do funil. Ela não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label htmlFor={`delete-${funnel.id}`} className="text-xs text-muted-foreground">
              Digite <strong className="text-foreground">{funnel.name}</strong> para confirmar
            </Label>
            <Input
              id={`delete-${funnel.id}`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className="border-border bg-muted/30 text-foreground"
            />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pending === 'delete'}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={pending === 'delete' || confirmation !== funnel.name}
              className="gap-2 bg-red-600 text-white hover:bg-red-500"
            >
              {pending === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir funil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ImportFunnelV2Dialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleOpenChange = (next: boolean) => {
    if (pending) return
    setOpen(next)
    if (!next) reset()
  }

  const handleImport = async () => {
    if (!file) return
    if (file.size > 960_000) {
      setError('O arquivo excede o limite de 960 KB.')
      return
    }

    setPending(true)
    setError(null)
    try {
      const text = await file.text()
      const payload: unknown = JSON.parse(text)
      const result = await importFunnelV2(workspaceId, payload)
      setOpen(false)
      router.push(`/dashboard/funnels/${result.funnelId}`)
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof SyntaxError
        ? 'O arquivo não contém um JSON válido.'
        : caught instanceof Error ? caught.message : 'Não foi possível importar o funil.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="gap-2 border-border bg-muted/30 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Upload className="h-4 w-4" /> Importar V2
          </Button>
        }
      />
      <DialogContent className="border-border bg-card text-foreground sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Importar funil V2</DialogTitle>
          <DialogDescription className="leading-relaxed text-muted-foreground">
            Use uma exportação <code className="text-violet-600">.funnelflow-v2.json</code> ou um documento bruto com schemaVersion 2. IDs serão regenerados.
          </DialogDescription>
        </DialogHeader>
        <label className="group my-2 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center transition hover:border-violet-400/30 hover:bg-violet-500/[0.035]">
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setError(null)
            }}
          />
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-violet-400/15 bg-violet-500/[0.08] text-violet-600">
            <FileJson className="h-5 w-5" />
          </span>
          <span className="mt-3 text-sm font-semibold text-foreground">
            {file ? file.name : 'Selecione o arquivo JSON'}
          </span>
          <span className="mt-1 text-xs text-muted-foreground/50">Máximo de 960 KB</span>
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-600">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleImport} disabled={!file || pending} className="gap-2 bg-violet-600 text-white hover:bg-violet-500">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {pending ? 'Validando e importando...' : 'Importar e abrir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UseFunnelTemplateButton({ templateId, workspaceId }: { templateId: string; workspaceId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUse = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await createFunnelFromTemplateV2(templateId, workspaceId)
      router.push(`/dashboard/funnels/${result.funnelId}`)
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar o funil.')
      setPending(false)
    }
  }

  return (
    <div>
      <Button type="button" onClick={handleUse} disabled={pending} className="h-9 gap-2 bg-muted px-3 text-xs text-foreground hover:bg-violet-500/15 hover:text-violet-600">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutTemplate className="h-3.5 w-3.5" />}
        {pending ? 'Criando...' : 'Usar template'}
      </Button>
      {error && <p role="alert" className="mt-2 max-w-52 text-[10px] leading-relaxed text-red-600">{error}</p>}
    </div>
  )
}
