'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createWorkspace } from '@/app/dashboard/actions'

interface Workspace {
  id: string
  name: string
}

export function WorkspaceSelector({
  workspaces,
}: {
  workspaces: Workspace[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentWorkspaceId = searchParams.get('ws') || undefined
  const [openModal, setOpenModal] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0]

  const handleSelect = (id: string) => {
    router.push(`/dashboard?ws=${id}`)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpenModal(nextOpen)
    if (!nextOpen) {
      setError(null)
      setNewWorkspaceName('')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return

    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('name', newWorkspaceName)
      const created = await createWorkspace(formData)
      setOpenModal(false)
      setNewWorkspaceName('')
      router.push(`/dashboard?ws=${created.id}`)
      router.refresh()
    } catch (err) {
      console.error(err)
      setError('Erro ao criar workspace. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="w-full justify-between border-zinc-800 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800"
            >
              <span className="truncate">{currentWorkspace ? currentWorkspace.name : 'Selecione o Workspace'}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent className="w-56 border-zinc-800 bg-zinc-900 text-zinc-200">
          <DropdownMenuLabel className="text-xs text-zinc-400">Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleSelect(ws.id)}
              className="flex items-center justify-between cursor-pointer focus:bg-zinc-800 focus:text-zinc-100"
            >
              <span className="truncate">{ws.name}</span>
              {ws.id === currentWorkspace?.id && <Check className="h-4 w-4 text-indigo-400" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            onClick={() => setOpenModal(true)}
            className="cursor-pointer text-indigo-400 focus:bg-zinc-800 focus:text-indigo-300"
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar Novo Workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openModal} onOpenChange={handleOpenChange}>
        <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-[425px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Novo Workspace</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Organize campanhas e quizzes por cliente ou marca.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <Label htmlFor="wsName" className="text-zinc-300">
                Nome do Workspace
              </Label>
              <Input
                id="wsName"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Ex: Agência Alpha, Loja X"
                className="border-zinc-700 bg-zinc-950 text-zinc-100"
                required
                autoFocus
              />
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
                {loading ? 'Criando...' : 'Criar Workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
