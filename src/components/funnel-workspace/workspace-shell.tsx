'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  GitBranch,
  LayoutDashboard,
  Settings2,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FunnelWorkspaceMeta } from './types'

const navigation = [
  { segment: '', label: 'Design', icon: LayoutDashboard },
  { segment: '/flow', label: 'Fluxo', icon: GitBranch },
  { segment: '/leads', label: 'Leads', icon: UsersRound },
  { segment: '/analytics', label: 'Analytics', icon: BarChart3 },
  { segment: '/settings', label: 'Configurações', icon: Settings2 },
] as const

const statusLabels = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
} as const

interface FunnelWorkspaceShellProps {
  funnel: FunnelWorkspaceMeta
  title: string
  description: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export function FunnelWorkspaceShell({
  funnel,
  title,
  description,
  children,
  actions,
}: FunnelWorkspaceShellProps) {
  const pathname = usePathname()
  const basePath = `/dashboard/funnels/${funnel.id}`

  return (
    <div className="min-h-screen bg-[#07080c] text-zinc-100 selection:bg-violet-500/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_48%_-12%,rgba(124,93,250,0.13),transparent_32%),radial-gradient(circle_at_96%_38%,rgba(34,211,238,0.045),transparent_24%)]" />

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#090a0f]/92 backdrop-blur-2xl">
        <div className="flex min-h-16 items-center gap-3 px-3 sm:px-5">
          <Link
            href="/dashboard?view=funnels"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
            aria-label="Voltar para os funis"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <Link href={basePath} className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-600 via-indigo-500 to-cyan-400 shadow-[0_10px_30px_-12px_rgba(124,58,237,0.95)]">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-[-0.02em] text-white">
                {funnel.name}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-600">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    funnel.status === 'published'
                      ? 'bg-emerald-400'
                      : funnel.status === 'archived'
                        ? 'bg-zinc-600'
                        : 'bg-amber-400',
                  )}
                />
                {statusLabels[funnel.status]} · revisão {funnel.draftRevision}
              </span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 xl:flex" aria-label="Áreas do funil">
            {navigation.map((item) => {
              const href = `${basePath}${item.segment}`
              const active = item.segment === '' ? pathname === basePath : pathname.startsWith(href)
              const Icon = item.icon
              return (
                <Link
                  key={item.segment}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition',
                    active
                      ? 'bg-white/[0.08] text-white ring-1 ring-white/[0.07]'
                      : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200',
                  )}
                >
                  <Icon className={cn('size-3.5', active && 'text-violet-300')} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {funnel.status === 'published' && funnel.publishedSlug && (
            <Link
              href={`/f/${funnel.publishedSlug}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto hidden h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold text-zinc-300 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-white xl:ml-2 xl:inline-flex"
            >
              Ver publicado
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.05] px-3 py-2 xl:hidden" aria-label="Áreas do funil">
          {navigation.map((item) => {
            const href = `${basePath}${item.segment}`
            const active = item.segment === '' ? pathname === basePath : pathname.startsWith(href)
            const Icon = item.icon
            return (
              <Link
                key={item.segment}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition',
                  active ? 'bg-violet-500/15 text-violet-200' : 'text-zinc-500 hover:bg-white/[0.04]',
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400/75">
              Workspace do funil
            </p>
            <h1 className="text-2xl font-extrabold tracking-[-0.035em] text-white sm:text-3xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{description}</p>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {children}
      </main>
    </div>
  )
}
