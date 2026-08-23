'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  FormInput,
  Gauge,
  Layers3,
  LayoutTemplate,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  WandSparkles,
  Workflow,
} from 'lucide-react'
import { CreateQuizDialog } from '@/components/dashboard/create-quiz-dialog'
import { DeleteQuizButton } from '@/components/dashboard/delete-quiz-button'
import { DuplicateQuizButton } from '@/components/dashboard/duplicate-quiz-button'
import { ExportQuizButton } from '@/components/dashboard/export-quiz-button'
import { ImportQuizButton } from '@/components/dashboard/import-quiz-button'
import { WorkspaceSelector } from '@/components/dashboard/workspace-selector'
import { CreateFunnelDialog } from '@/components/dashboard-v2/create-funnel-dialog'
import { MediaLibrary } from '@/components/dashboard-v2/media-library'
import {
  FunnelActionsMenu,
  ImportFunnelV2Dialog,
  UseFunnelTemplateButton,
} from '@/components/dashboard-v2/funnel-management-actions'
import { cn } from '@/lib/utils'

export type DashboardViewName = 'overview' | 'funnels' | 'templates' | 'media' | 'legacy' | 'settings'

export interface FunnelSummary {
  id: string
  name: string
  slug: string
  publishedSlug: string | null
  status: string
  createdAt: string
  updatedAt: string
  draftRevision: number
  publishedVersionId: string | null
  pageCount: number
  submissionCount: number
}

export interface LegacyQuizSummary {
  id: string
  title: string
  description: string | null
  status: string
  createdAt: string
  updatedAt: string
  questionCount: number
  leadCount: number
}

export interface FunnelTemplateSummary {
  id: string
  name: string
  description: string
  category: string
  createdAt: string
  sourceFunnelId: string | null
  isSystem: boolean
}

interface WorkspaceSummary {
  id: string
  name: string
}

interface DashboardHomeProps {
  view: DashboardViewName
  workspaceId?: string
  workspaceName: string
  workspaces: WorkspaceSummary[]
  userEmail: string
  funnels: FunnelSummary[]
  legacyQuizzes: LegacyQuizSummary[]
  funnelTemplates: FunnelTemplateSummary[]
  totalLegacyLeads: number
  totalLegacyCompleted: number
  funnelDataAvailable: boolean
}

const viewCopy: Record<DashboardViewName, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: 'Central de operação',
    title: 'Visão geral',
    description: 'Acompanhe seus projetos e continue exatamente de onde parou.',
  },
  funnels: {
    eyebrow: 'Funnel Builder V2',
    title: 'Seus funis',
    description: 'Crie experiências responsivas, publique versões e acompanhe resultados.',
  },
  templates: {
    eyebrow: 'Comece mais rápido',
    title: 'Galeria de templates',
    description: 'Estruturas prontas para os principais objetivos de captação e qualificação.',
  },
  media: {
    eyebrow: 'Assets do workspace',
    title: 'Biblioteca de mídia',
    description: 'Envie, organize e reutilize imagens, vídeos, áudios e documentos nos seus funis.',
  },
  legacy: {
    eyebrow: 'Compatibilidade preservada',
    title: 'Projetos legados',
    description: 'Seus quizzes atuais continuam funcionando e podem ser editados normalmente.',
  },
  settings: {
    eyebrow: 'Preferências',
    title: 'Workspace e conta',
    description: 'Gerencie o contexto de trabalho ativo e as informações da sua sessão.',
  },
}

const templateIdeas = [
  {
    name: 'Página em branco',
    description: 'Uma página limpa para montar sua estrutura com total liberdade.',
    category: 'Base',
    icon: Layers3,
    tone: 'from-violet-500/25 to-indigo-500/5 text-violet-300',
    available: true,
  },
]

// Visual identity for the 3 curated system templates, matched by category
// (set when they were seeded — see supabase/migrations). Falls back to a
// neutral violet tone for any other system or workspace template.
const systemTemplateTone: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  'Conversão': { icon: FormInput, tone: 'from-cyan-500/20 to-sky-500/5 text-cyan-300' },
  'Qualificação': { icon: Gauge, tone: 'from-amber-500/20 to-orange-500/5 text-amber-300' },
  'Seleção': { icon: CheckCircle2, tone: 'from-emerald-500/20 to-teal-500/5 text-emerald-300' },
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatDate(value: string) {
  if (!value) return 'Agora'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function StatusPill({ status, legacy = false }: { status: string; legacy?: boolean }) {
  const normalized = status.toLowerCase()
  const published = normalized === 'published'
  const archived = normalized === 'archived'
  const label = published ? 'Publicado' : archived ? 'Arquivado' : 'Rascunho'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold',
        published && 'border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300',
        archived && 'border-zinc-600/20 bg-zinc-600/[0.08] text-zinc-500',
        !published && !archived && 'border-amber-400/15 bg-amber-400/[0.06] text-amber-300',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', published ? 'bg-emerald-400' : archived ? 'bg-zinc-600' : 'bg-amber-400')} />
      {label}{legacy ? ' · legado' : ''}
    </span>
  )
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
}: {
  label: string
  value: string | number
  helper: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.065] bg-[#0c0d13]/80 p-5 shadow-[0_18px_60px_-45px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-white/10">
      <div className={cn('absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.08] blur-3xl transition group-hover:opacity-[0.14]', accent)} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-600">{label}</p>
          <p className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-zinc-100">{value}</p>
          <p className="mt-1.5 text-xs text-zinc-400">{helper}</p>
        </div>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.035]', accent.replace('bg-', 'text-'))}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </article>
  )
}

function EmptyFunnels({ workspaceId, available }: { workspaceId?: string; available: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/10 bg-[#0b0c12]/60 px-5 py-14 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.09),transparent_48%)]" />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-violet-400/15 bg-violet-500/[0.08] text-violet-300 shadow-[0_12px_45px_-20px_rgba(124,58,237,0.8)]">
          <Workflow className="h-6 w-6" />
        </span>
        <h3 className="mt-5 text-lg font-bold text-zinc-100">
          {available ? 'Seu primeiro funil começa aqui' : 'O Builder V2 está quase pronto neste ambiente'}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {available
            ? 'Crie uma experiência responsiva e organize cada página com seções, containers e elementos.'
            : 'Assim que a estrutura de dados V2 estiver disponível, seus novos funis aparecerão automaticamente aqui.'}
        </p>
        {workspaceId && available && (
          <div className="mt-6">
            <CreateFunnelDialog workspaceId={workspaceId} />
          </div>
        )}
      </div>
    </div>
  )
}

function FunnelCard({ funnel, index }: { funnel: FunnelSummary; index: number }) {
  const tones = [
    'from-violet-500/35 via-indigo-500/10 to-transparent',
    'from-cyan-500/30 via-blue-500/10 to-transparent',
    'from-fuchsia-500/30 via-violet-500/10 to-transparent',
    'from-emerald-500/25 via-cyan-500/10 to-transparent',
  ]

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c0d13]/90 transition duration-300 hover:-translate-y-0.5 hover:border-violet-400/20 hover:shadow-[0_22px_70px_-42px_rgba(99,102,241,0.75)]">
      <Link href={`/dashboard/funnels/${funnel.id}`} className="block" aria-label={`Editar ${funnel.name}`}>
        <div className={cn('relative h-28 overflow-hidden border-b border-white/[0.055] bg-gradient-to-br', tones[index % tones.length])}>
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute inset-x-6 bottom-0 h-[72px] rounded-t-xl border border-b-0 border-white/10 bg-[#101118]/90 px-4 pt-4 shadow-xl transition-transform duration-300 group-hover:-translate-y-1">
            <div className="h-2 w-2/3 rounded-full bg-white/15" />
            <div className="mt-2 h-1.5 w-4/5 rounded-full bg-white/[0.07]" />
            <div className="mt-3 h-4 w-16 rounded bg-violet-500/50" />
          </div>
          <span className="absolute right-3 top-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[9px] text-zinc-400 backdrop-blur">
            v{funnel.draftRevision || 1}
          </span>
        </div>
      </Link>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/dashboard/funnels/${funnel.id}`} className="block truncate text-sm font-bold text-zinc-100 hover:text-violet-300">
              {funnel.name}
            </Link>
            <p className="mt-1 truncate font-mono text-[10px] text-zinc-700">/{funnel.slug}</p>
          </div>
          <StatusPill status={funnel.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-white/[0.055] py-3">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-zinc-700">Páginas</p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-300">{funnel.pageCount}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-zinc-700">Respostas</p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-300">{funnel.submissionCount}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-zinc-700">Alterado</p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-zinc-400">{formatDate(funnel.updatedAt)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/dashboard/funnels/${funnel.id}`}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-white/[0.06] text-xs font-semibold text-zinc-200 transition hover:bg-violet-500/15 hover:text-violet-200"
          >
            Abrir editor <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {funnel.status === 'published' && funnel.publishedSlug && (
            <Link
              href={`/f/${funnel.publishedSlug}`}
              target="_blank"
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.07] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
              title="Abrir versão publicada"
              aria-label={`Abrir versão publicada de ${funnel.name}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <FunnelActionsMenu funnel={funnel} />
        </div>
      </div>
    </article>
  )
}

function LegacyQuizCard({ quiz }: { quiz: LegacyQuizSummary }) {
  return (
    <article className="rounded-2xl border border-white/[0.065] bg-[#0c0d13]/85 p-4 transition hover:border-white/10">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-400/10 bg-amber-400/[0.055] text-amber-300">
          <FileText className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/dashboard/quiz/${quiz.id}`} className="truncate text-sm font-bold text-zinc-200 hover:text-violet-300">
              {quiz.title}
            </Link>
            <StatusPill status={quiz.status} legacy />
          </div>
          <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-zinc-400">
            {quiz.description || 'Sem descrição definida.'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-5 border-y border-white/[0.05] py-3 text-[11px] text-zinc-600">
        <span><strong className="font-semibold text-zinc-300">{quiz.questionCount}</strong> blocos</span>
        <span><strong className="font-semibold text-zinc-300">{quiz.leadCount}</strong> leads</span>
        <span className="ml-auto hidden sm:inline">{formatDate(quiz.updatedAt || quiz.createdAt)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/quiz/${quiz.id}`}
          className="flex h-9 min-w-28 flex-1 items-center justify-center gap-2 rounded-lg bg-white/[0.055] px-3 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.09] hover:text-white"
        >
          Editar quiz <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {quiz.status === 'published' && (
          <Link
            href={`/q/${quiz.id}`}
            target="_blank"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.07] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
            title="Abrir player público"
            aria-label={`Abrir ${quiz.title}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
        <DuplicateQuizButton quizId={quiz.id} />
        <ExportQuizButton quizId={quiz.id} quizTitle={quiz.title} />
        <DeleteQuizButton quizId={quiz.id} quizTitle={quiz.title} />
      </div>
    </article>
  )
}

export function DashboardHome({
  view,
  workspaceId,
  workspaceName,
  workspaces,
  userEmail,
  funnels,
  legacyQuizzes,
  funnelTemplates,
  totalLegacyLeads,
  totalLegacyCompleted,
  funnelDataAvailable,
}: DashboardHomeProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all')
  const copy = viewCopy[view]
  const searchable = view === 'overview' || view === 'funnels' || view === 'legacy'
  const normalizedSearch = normalizeSearch(search)

  const filteredFunnels = useMemo(() => {
    return funnels.filter((funnel) => {
      const matchesSearch = !normalizedSearch || normalizeSearch(`${funnel.name} ${funnel.slug}`).includes(normalizedSearch)
      const matchesStatus = statusFilter === 'all' || funnel.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [funnels, normalizedSearch, statusFilter])

  const filteredLegacy = useMemo(() => {
    return legacyQuizzes.filter((quiz) => !normalizedSearch || normalizeSearch(`${quiz.title} ${quiz.description || ''}`).includes(normalizedSearch))
  }, [legacyQuizzes, normalizedSearch])

  const systemFunnelTemplates = funnelTemplates.filter((template) => template.isSystem)
  const workspaceFunnelTemplates = funnelTemplates.filter((template) => !template.isSystem)

  const publishedFunnels = funnels.filter((funnel) => funnel.status === 'published').length
  const v2Submissions = funnels.reduce((sum, funnel) => sum + funnel.submissionCount, 0)
  const allLeads = totalLegacyLeads + v2Submissions
  const legacyCompletionRate = totalLegacyLeads > 0 ? Math.round((totalLegacyCompleted / totalLegacyLeads) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <header className="flex flex-col gap-5 border-b border-white/[0.06] pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-px w-5 bg-violet-400/60" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/80">{copy.eyebrow}</p>
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.045em] text-white sm:text-4xl">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{copy.description}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:items-center">
          {searchable && (
            <label className="relative block min-w-0 flex-1 xl:w-[280px]" htmlFor="dashboard-search">
              <span className="sr-only">Buscar projetos</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                id="dashboard-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={view === 'legacy' ? 'Buscar quiz legado...' : 'Buscar funil...'}
                className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] pl-10 pr-4 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-700 hover:border-white/10 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/10"
              />
            </label>
          )}

          {workspaceId && (view === 'overview' || view === 'funnels') && funnelDataAvailable && (
            <div className="flex flex-wrap items-center gap-2">
              {view === 'funnels' && <ImportFunnelV2Dialog workspaceId={workspaceId} />}
              <CreateFunnelDialog workspaceId={workspaceId} />
            </div>
          )}

          {workspaceId && view === 'legacy' && (
            <div className="flex flex-wrap items-center gap-2">
              <ImportQuizButton workspaceId={workspaceId} />
              <CreateQuizDialog
                workspaceId={workspaceId}
                existingQuizzes={legacyQuizzes.map((quiz) => ({ id: quiz.id, title: quiz.title }))}
              />
            </div>
          )}
        </div>
      </header>

      {view === 'overview' && (
        <div className="space-y-8 pt-8">
          <section className="relative overflow-hidden rounded-3xl border border-violet-400/10 bg-[#0c0d14] px-5 py-7 shadow-[0_24px_90px_-55px_rgba(99,102,241,0.8)] sm:px-8 sm:py-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_-10%,rgba(124,58,237,0.19),transparent_35%),linear-gradient(105deg,transparent_55%,rgba(34,211,238,0.025))]" />
            <div className="pointer-events-none absolute right-8 top-1/2 hidden h-44 w-72 -translate-y-1/2 rotate-[-5deg] rounded-2xl border border-white/[0.07] bg-black/20 p-5 opacity-70 lg:block">
              <div className="flex gap-2"><span className="h-2 w-2 rounded-full bg-violet-400" /><span className="h-2 w-2 rounded-full bg-white/10" /><span className="h-2 w-2 rounded-full bg-white/10" /></div>
              <div className="mt-6 h-3 w-3/5 rounded-full bg-white/10" />
              <div className="mt-3 h-2 w-4/5 rounded-full bg-white/[0.05]" />
              <div className="mt-6 flex gap-2"><span className="h-7 w-20 rounded-md bg-violet-500/50" /><span className="h-7 w-20 rounded-md border border-white/[0.07]" /></div>
            </div>
            <div className="relative max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/15 bg-violet-500/[0.07] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-300">
                <WandSparkles className="h-3 w-3" /> Nova experiência
              </span>
              <h2 className="mt-5 max-w-xl text-2xl font-extrabold leading-tight tracking-[-0.035em] text-white sm:text-3xl">
                Construa páginas que conversam com cada lead.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
                Organize páginas, componentes e formulários em um só canvas. Salve como rascunho e publique apenas quando estiver pronto.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {workspaceId && funnelDataAvailable ? (
                  <CreateFunnelDialog workspaceId={workspaceId} triggerLabel="Criar primeiro funil" />
                ) : (
                  <span className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-2.5 text-xs font-medium text-zinc-500">Aguardando estrutura V2</span>
                )}
                <Link
                  href={workspaceId ? `/dashboard?view=templates&ws=${workspaceId}` : '/dashboard?view=templates'}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                >
                  Explorar templates <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do workspace">
            <MetricCard label="Funis V2" value={funnels.length} helper={`${publishedFunnels} publicados`} icon={Workflow} accent="bg-violet-400" />
            <MetricCard label="Leads registrados" value={allLeads} helper="V2 e projetos legados" icon={Users} accent="bg-cyan-400" />
            <MetricCard label="Projetos legados" value={legacyQuizzes.length} helper="Compatibilidade mantida" icon={Boxes} accent="bg-amber-400" />
            <MetricCard label="Conclusão legada" value={`${legacyCompletionRate}%`} helper={`${totalLegacyCompleted} conclusões`} icon={Activity} accent="bg-emerald-400" />
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">Funis recentes</h2>
                <p className="mt-1 text-xs text-zinc-600">Rascunhos e publicações deste workspace.</p>
              </div>
              <Link
                href={workspaceId ? `/dashboard?view=funnels&ws=${workspaceId}` : '/dashboard?view=funnels'}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
              >
                Ver todos <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {filteredFunnels.length === 0 ? (
              <EmptyFunnels workspaceId={workspaceId} available={funnelDataAvailable} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredFunnels.slice(0, 6).map((funnel, index) => <FunnelCard key={funnel.id} funnel={funnel} index={index} />)}
              </div>
            )}
          </section>
        </div>
      )}

      {view === 'funnels' && (
        <div className="space-y-6 pt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1" role="group" aria-label="Filtrar por status">
              {(['all', 'draft', 'published', 'archived'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    statusFilter === filter ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-600 hover:text-zinc-300',
                  )}
                >
                  {filter === 'all'
                    ? 'Todos'
                    : filter === 'draft'
                      ? 'Rascunhos'
                      : filter === 'published'
                        ? 'Publicados'
                        : 'Arquivados'}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-zinc-700">
              <Filter className="h-3.5 w-3.5" /> {filteredFunnels.length} {filteredFunnels.length === 1 ? 'funil encontrado' : 'funis encontrados'}
            </p>
          </div>

          {filteredFunnels.length === 0 ? (
            normalizedSearch || statusFilter !== 'all' ? (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-14 text-center">
                <Search className="mx-auto h-6 w-6 text-zinc-700" />
                <h3 className="mt-3 text-sm font-semibold text-zinc-300">Nenhum funil corresponde aos filtros</h3>
                <button type="button" onClick={() => { setSearch(''); setStatusFilter('all') }} className="mt-3 text-xs font-semibold text-violet-300 hover:text-violet-200">Limpar filtros</button>
              </div>
            ) : (
              <EmptyFunnels workspaceId={workspaceId} available={funnelDataAvailable} />
            )
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredFunnels.map((funnel, index) => <FunnelCard key={funnel.id} funnel={funnel} index={index} />)}
            </div>
          )}
        </div>
      )}

      {view === 'templates' && (
        <div className="space-y-9 pt-8">
          {systemFunnelTemplates.length > 0 && (
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-zinc-100">Templates do Builder V2</h2>
                    <span className="rounded-full border border-violet-400/15 bg-violet-500/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">Curado</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">Estruturas prontas, mantidas pela plataforma, disponíveis para todos os workspaces.</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="flex min-h-64 flex-col overflow-hidden rounded-2xl border border-white/[0.065] bg-[#0c0d13]/85 transition hover:-translate-y-0.5 hover:border-white/10">
                  <div className={cn('relative grid h-28 place-items-center border-b border-white/[0.055] bg-gradient-to-br', templateIdeas[0].tone)}>
                    <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,.13)_1px,transparent_1px)] [background-size:16px_16px]" />
                    <Layers3 className="relative h-8 w-8" />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-zinc-200">{templateIdeas[0].name}</h3>
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-700">{templateIdeas[0].category}</span>
                    </div>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{templateIdeas[0].description}</p>
                    <div className="mt-4">
                      {workspaceId && funnelDataAvailable ? (
                        <CreateFunnelDialog workspaceId={workspaceId} compact initialName="Novo funil" triggerLabel="Usar base" />
                      ) : (
                        <span className="inline-flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-700">Indisponível</span>
                      )}
                    </div>
                  </div>
                </article>
                {systemFunnelTemplates.map((template) => {
                  const visual = systemTemplateTone[template.category] ?? { icon: LayoutTemplate, tone: 'from-violet-500/20 to-indigo-500/5 text-violet-300' }
                  const Icon = visual.icon
                  return (
                    <article key={template.id} className="flex min-h-64 flex-col overflow-hidden rounded-2xl border border-white/[0.065] bg-[#0c0d13]/85 transition hover:-translate-y-0.5 hover:border-white/10">
                      <div className={cn('relative grid h-28 place-items-center border-b border-white/[0.055] bg-gradient-to-br', visual.tone)}>
                        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,.13)_1px,transparent_1px)] [background-size:16px_16px]" />
                        <Icon className="relative h-8 w-8" />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-zinc-200">{template.name}</h3>
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-700">{template.category}</span>
                        </div>
                        <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{template.description}</p>
                        <div className="mt-4">
                          {workspaceId ? (
                            <UseFunnelTemplateButton templateId={template.id} workspaceId={workspaceId} />
                          ) : (
                            <span className="inline-flex h-9 items-center rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-700">Indisponível</span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {workspaceFunnelTemplates.length > 0 && (
            <section>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-zinc-100">Templates do workspace</h2>
                    <span className="rounded-full border border-emerald-400/15 bg-emerald-500/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Snapshot publicado</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">Cópias seguras criadas a partir de versões imutáveis publicadas.</p>
                </div>
                {workspaceId && <ImportFunnelV2Dialog workspaceId={workspaceId} />}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {workspaceFunnelTemplates.map((template) => (
                  <article key={template.id} className="flex min-h-52 flex-col overflow-hidden rounded-2xl border border-emerald-400/10 bg-[#0c0d13]/85 transition hover:-translate-y-0.5 hover:border-emerald-400/20">
                    <div className="relative grid h-20 place-items-center border-b border-white/[0.055] bg-gradient-to-br from-emerald-500/20 via-cyan-500/[0.06] to-transparent">
                      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:20px_20px]" />
                      <LayoutTemplate className="relative h-7 w-7 text-emerald-300" />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-bold text-zinc-200">{template.name}</h3>
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-zinc-700">{template.category}</span>
                      </div>
                      <p className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{template.description || 'Estrutura pronta para duplicar e personalizar.'}</p>
                      <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/[0.05] pt-3">
                        <span className="text-[10px] text-zinc-700">Criado em {formatDate(template.createdAt)}</span>
                        {workspaceId && <UseFunnelTemplateButton templateId={template.id} workspaceId={workspaceId} />}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {view === 'legacy' && (
        <div className="space-y-6 pt-7">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/10 bg-amber-400/[0.035] p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-semibold text-amber-100/80">Nenhuma mudança nos links publicados</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">O editor e o player atuais permanecem disponíveis enquanto o Builder V2 evolui.</p>
            </div>
          </div>

          {filteredLegacy.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.07] px-5 py-14 text-center">
              <FileText className="mx-auto h-7 w-7 text-zinc-700" />
              <h3 className="mt-4 text-sm font-semibold text-zinc-300">{normalizedSearch ? 'Nenhum quiz encontrado' : 'Nenhum projeto legado neste workspace'}</h3>
              <p className="mt-2 text-xs text-zinc-600">{normalizedSearch ? 'Tente buscar por outro termo.' : 'Você pode importar um arquivo ou criar um quiz no editor atual.'}</p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredLegacy.map((quiz) => <LegacyQuizCard key={quiz.id} quiz={quiz} />)}
            </div>
          )}
        </div>
      )}

      {view === 'media' && (
        <MediaLibrary workspaceId={workspaceId} funnels={funnels.map((funnel) => ({ id: funnel.id, name: funnel.name }))} />
      )}

      {view === 'settings' && (
        <div className="grid gap-5 pt-8 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-2xl border border-white/[0.065] bg-[#0c0d13]/80 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/15 bg-violet-500/[0.06] text-violet-300"><Settings2 className="h-4 w-4" /></span>
                  <div>
                    <h2 className="text-sm font-bold text-zinc-200">Workspace ativo</h2>
                    <p className="mt-0.5 text-xs text-zinc-400">Alterne o contexto dos seus projetos.</p>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[10px] font-semibold text-emerald-300"><Check className="h-3 w-3" /> Ativo</span>
            </div>
            <div className="mt-5 max-w-sm">
              <WorkspaceSelector workspaces={workspaces} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/dashboard?view=settings&ws=${workspace.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3.5 transition',
                    workspace.id === workspaceId ? 'border-violet-400/20 bg-violet-500/[0.055]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10',
                  )}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-black/25 text-xs font-bold text-zinc-300">{workspace.name.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-300">{workspace.name}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-700">{workspace.id === workspaceId ? 'Em uso agora' : 'Abrir workspace'}</p>
                  </div>
                  {workspace.id === workspaceId && <Check className="h-4 w-4 text-violet-300" />}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.065] bg-[#0c0d13]/80 p-5 sm:p-6">
            <div className="flex items-center gap-3 border-b border-white/[0.06] pb-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 text-sm font-bold text-zinc-100">{userEmail.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-zinc-200">Sua conta</h2>
                <p className="mt-0.5 truncate text-xs text-zinc-400">{userEmail}</p>
              </div>
            </div>
            <dl className="mt-5 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Produto</dt><dd className="font-semibold text-zinc-300">Funnel Studio V2</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Workspace</dt><dd className="max-w-[180px] truncate font-semibold text-zinc-300">{workspaceName}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Sessão</dt><dd className="inline-flex items-center gap-1.5 font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Segura</dd></div>
            </dl>
            <form action="/logout" method="POST" className="mt-6">
              <button type="submit" className="flex h-10 w-full items-center justify-center rounded-xl border border-white/[0.07] text-xs font-semibold text-zinc-500 transition hover:border-red-400/15 hover:bg-red-500/[0.05] hover:text-red-300">Sair desta conta</button>
            </form>
          </section>

          <section className="rounded-2xl border border-white/[0.065] bg-[#0c0d13]/80 p-5 sm:p-6 xl:col-span-2">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Rocket, label: 'Publicação segura', text: 'Rascunhos separados da versão pública.' },
                { icon: Clock3, label: 'Histórico de versões', text: 'Restaure mudanças sem afetar o que está no ar.' },
                { icon: BarChart3, label: 'Dados no workspace', text: 'Leads e métricas isolados por organização.' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.018] p-4">
                  <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <div><p className="text-xs font-semibold text-zinc-300">{item.label}</p><p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.text}</p></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
