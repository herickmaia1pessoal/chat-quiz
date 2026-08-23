'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Archive,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LayoutTemplate,
  Images,
  LogOut,
  Menu,
  Settings2,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react'
import { WorkspaceSelector } from '@/components/dashboard/workspace-selector'
import { cn } from '@/lib/utils'

interface Workspace {
  id: string
  name: string
}

interface DashboardShellProps {
  children: React.ReactNode
  workspaces: Workspace[]
  userEmail: string
}

const navigation = [
  { label: 'Visão geral', view: 'overview', icon: LayoutDashboard },
  { label: 'Funis', view: 'funnels', icon: Workflow },
  { label: 'Templates', view: 'templates', icon: LayoutTemplate },
  { label: 'Biblioteca de mídia', view: 'media', icon: Images },
  { label: 'Projetos legados', view: 'legacy', icon: Archive },
] as const

export function DashboardShell({ children, workspaces, userEmail }: DashboardShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)

  const activeWorkspaceId = searchParams.get('ws') || workspaces[0]?.id
  const currentView = searchParams.get('view') || 'overview'
  const isDashboardHome = pathname === '/dashboard'
  const isFunnelBuilder = pathname.startsWith('/dashboard/funnels/')

  const dashboardHref = (view: string) => {
    const params = new URLSearchParams()
    if (view !== 'overview') params.set('view', view)
    if (activeWorkspaceId) params.set('ws', activeWorkspaceId)
    const query = params.toString()
    return query ? `/dashboard?${query}` : '/dashboard'
  }

  if (isFunnelBuilder) {
    return <main className="min-h-screen bg-[#07080c] text-zinc-100">{children}</main>
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[76px] items-center justify-between border-b border-white/[0.06] px-5">
        <Link href={dashboardHref('overview')} className="group flex items-center gap-3" aria-label="Ir para o início">
          <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-400 shadow-[0_10px_35px_-12px_rgba(99,102,241,0.9)]">
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
            <span className="absolute inset-x-1 top-0 h-px bg-white/60" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-extrabold tracking-[-0.02em] text-white">FunnelFlow</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Funnel Studio</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <div className="px-2">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Workspace</p>
          <WorkspaceSelector workspaces={workspaces} />
        </div>

        <nav className="mt-7 space-y-1" aria-label="Navegação principal">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Construir</p>
          {navigation.map((item) => {
            const active = isDashboardHome && currentView === item.view
            const Icon = item.icon
            return (
              <Link
                key={item.view}
                href={dashboardHref(item.view)}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition',
                  active
                    ? 'bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet-400" />}
                <Icon className={cn('h-[17px] w-[17px]', active ? 'text-violet-300' : 'text-zinc-600 group-hover:text-zinc-400')} aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />}
              </Link>
            )
          })}
        </nav>

        <nav className="mt-7 space-y-1" aria-label="Navegação de suporte">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Gerenciar</p>
          <Link
            href={dashboardHref('settings')}
            onClick={() => setMobileOpen(false)}
            aria-current={isDashboardHome && currentView === 'settings' ? 'page' : undefined}
            className={cn(
              'group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition',
              isDashboardHome && currentView === 'settings'
                ? 'bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
            )}
          >
            <Settings2 className="h-[17px] w-[17px]" aria-hidden="true" />
            Workspace e conta
          </Link>
          <a
            href="mailto:suporte@quizflow.app"
            className="group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
          >
            <CircleHelp className="h-[17px] w-[17px]" aria-hidden="true" />
            Central de ajuda
          </a>
        </nav>
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 text-xs font-bold text-zinc-100">
            {userEmail.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-200">{userEmail}</p>
            <p className="text-[10px] text-emerald-400/80">Conta ativa</p>
          </div>
          <form action="/logout" method="POST">
            <button
              type="submit"
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400"
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07080c] text-zinc-100 selection:bg-violet-500/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_58%_-15%,rgba(109,94,252,0.10),transparent_33%),radial-gradient(circle_at_100%_48%,rgba(34,211,238,0.035),transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-white/[0.06] bg-[#090a0f]/95 backdrop-blur-2xl lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[min(86vw,304px)] border-r border-white/10 bg-[#090a0f] shadow-2xl lg:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <div className="relative min-h-screen lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#090a0f]/90 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-zinc-300"
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={dashboardHref('overview')} className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            FunnelFlow
          </Link>
          <Link
            href={dashboardHref('settings')}
            className="grid h-10 w-10 place-items-center rounded-xl text-zinc-400 hover:bg-white/[0.04]"
            aria-label="Abrir configurações"
          >
            <Settings2 className="h-5 w-5" />
          </Link>
        </header>

        <main className="relative min-h-screen px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
