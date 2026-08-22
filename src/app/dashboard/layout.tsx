import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, LayoutDashboard, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { WorkspaceSelector } from '@/components/dashboard/workspace-selector'
import { Button } from '@/components/ui/button'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch workspaces for current user
  let { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name')
    .order('created_at', { ascending: true })

  // If user has no workspace, auto-create their default one
  if (!workspaces || workspaces.length === 0) {
    const { data: newWs } = await supabase
      .from('workspaces')
      .insert({
        name: 'Meu Workspace',
        owner_id: user.id,
      })
      .select('id, name')
      .single()

    if (newWs) {
      workspaces = [newWs]
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl flex flex-col justify-between p-4 shrink-0">
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
                QuizFlow
              </span>
              <span className="ml-1.5 text-[11px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                MVP
              </span>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider px-2">
              Workspace Ativo
            </label>
            <WorkspaceSelector workspaces={workspaces || []} />
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 pt-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-900 text-zinc-100 text-sm font-medium border border-zinc-800"
            >
              <LayoutDashboard className="h-4 w-4 text-indigo-400" />
              Painel de Quizzes
            </Link>
          </nav>
        </div>

        {/* User profile & Logout */}
        <div className="border-t border-zinc-800/80 pt-4 mt-6 flex items-center justify-between px-2">
          <div className="truncate max-w-[140px]">
            <p className="text-xs font-medium text-zinc-200 truncate">{user.email}</p>
            <p className="text-[11px] text-zinc-500">Conectado</p>
          </div>
          <form action="/logout" method="POST">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-red-400 hover:bg-zinc-900"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/30 via-zinc-950 to-zinc-950 p-6 md:p-10">
        {children}
      </main>
    </div>
  )
}
