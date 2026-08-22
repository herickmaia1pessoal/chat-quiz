import Link from 'next/link'
import { HelpCircle, Users, CheckCircle2, ExternalLink, Settings, Sparkles } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { CreateQuizDialog } from '@/components/dashboard/create-quiz-dialog'
import { TemplatesDialog } from '@/components/dashboard/templates-dialog'
import { DuplicateQuizButton } from '@/components/dashboard/duplicate-quiz-button'
import { QuizStatusBadge } from '@/components/quiz-status-badge'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  // Fetch all workspaces the user can see (RLS-scoped) to validate/select the active one
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name')
    .order('created_at', { ascending: true })

  // Use the ?ws= param only if it actually belongs to this user; otherwise fall back to the first workspace
  const requestedWs = params.ws
  const activeWsId =
    requestedWs && workspaces?.some((w) => w.id === requestedWs)
      ? requestedWs
      : workspaces?.[0]?.id

  // Fetch quizzes for this workspace
  const { data: quizzes } = activeWsId
    ? await supabase
        .from('quizzes')
        .select(`
          id,
          title,
          description,
          status,
          created_at,
          questions:questions(count),
          leads:leads_responses(count)
        `)
        .eq('workspace_id', activeWsId)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Compute metrics across quizzes in workspace
  let totalLeads = 0
  const totalQuizzes = quizzes?.length || 0
  const quizIds = quizzes?.map((q: any) => q.id) || []

  quizzes?.forEach((q: any) => {
    totalLeads += q.leads?.[0]?.count || 0
  })

  // Separate count query for completed leads (kept simple/robust rather than an embedded PostgREST filter)
  let totalCompletedLeads = 0
  if (quizIds.length > 0) {
    const { count } = await supabase
      .from('leads_responses')
      .select('id', { count: 'exact', head: true })
      .in('quiz_id', quizIds)
      .eq('status', 'completed')
    totalCompletedLeads = count || 0
  }

  const completionRate = totalLeads > 0 ? ((totalCompletedLeads / totalLeads) * 100).toFixed(1) : '0'

  // Fetch templates for template picker
  const { data: templates } = await supabase
    .from('quiz_templates')
    .select('id, name, description, category, thumbnail_emoji')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header with Title and Create Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Meus Quizzes
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Gerencie e crie quizzes interativos focados em conversão de leads e tráfego pago.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeWsId && templates && templates.length > 0 && (
            <TemplatesDialog workspaceId={activeWsId} templates={templates} />
          )}
          {activeWsId && <CreateQuizDialog workspaceId={activeWsId} />}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xl relative overflow-hidden group hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs uppercase font-medium tracking-wider">Quizzes Criados</span>
            <HelpCircle className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-3xl font-bold text-white mt-3">{totalQuizzes}</p>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition"></div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xl relative overflow-hidden group hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs uppercase font-medium tracking-wider">Total de Leads Capturados</span>
            <Users className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-3">{totalLeads}</p>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition"></div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-xl relative overflow-hidden group hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs uppercase font-medium tracking-wider">Taxa de Conclusão Média</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-3">
            {completionRate}%
          </p>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition"></div>
        </div>
      </div>

      {/* Quizzes List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-zinc-200">Quizzes Ativos</h2>

        {!activeWsId ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-12 text-center flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-zinc-200">Nenhum workspace encontrado</h3>
            <p className="text-zinc-400 text-sm max-w-sm mt-1">
              Recarregue a página para criarmos seu workspace padrão automaticamente, ou crie um pelo menu lateral.
            </p>
          </div>
        ) : (!quizzes || quizzes.length === 0) ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-12 text-center flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-zinc-200">Nenhum quiz encontrado</h3>
            <p className="text-zinc-400 text-sm max-w-sm mt-1 mb-6">
              Crie seu primeiro quiz interativo em minutos e comece a gerar leads qualificados.
            </p>
            <CreateQuizDialog workspaceId={activeWsId} />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz: any) => {
              const questionCount = quiz.questions?.[0]?.count || 0
              const leadCount = quiz.leads?.[0]?.count || 0

              return (
                <div
                  key={quiz.id}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 backdrop-blur-xl flex flex-col justify-between hover:border-zinc-700 transition space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-lg text-white leading-tight line-clamp-1">
                        {quiz.title}
                      </h3>
                      <QuizStatusBadge status={quiz.status} className="shrink-0" />
                    </div>

                    <p className="text-zinc-400 text-xs line-clamp-2 min-h-[32px]">
                      {quiz.description || 'Sem descrição definida.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 py-3 border-y border-zinc-800/60 text-xs text-zinc-400">
                    <div>
                      <span className="text-zinc-500 block text-[11px] uppercase">Perguntas</span>
                      <span className="font-semibold text-zinc-200">{questionCount}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px] uppercase">Leads</span>
                      <span className="font-semibold text-zinc-200">{leadCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Link
                      href={`/dashboard/quiz/${quiz.id}`}
                      className="flex-1 text-center py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition flex items-center justify-center gap-1.5"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Editar & Builder
                    </Link>
                    {quiz.status === 'published' && (
                      <Link
                        href={`/q/${quiz.id}`}
                        target="_blank"
                        className="py-2 px-3 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition flex items-center justify-center gap-1"
                        title="Ver Player Público"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    <DuplicateQuizButton quizId={quiz.id} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
