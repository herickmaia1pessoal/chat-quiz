import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Settings, ListOrdered, Users, BarChart2, Sparkles } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QuestionsTab } from '@/components/builder/questions-tab'
import { SettingsTab } from '@/components/builder/settings-tab'
import { LeadsTab } from '@/components/builder/leads-tab'
import { FunnelChart } from '@/components/builder/funnel-chart'
import { ResultLevelsTab } from '@/components/builder/result-levels-tab'
import { QuizStatusBadge } from '@/components/quiz-status-badge'
import { buttonVariants } from '@/components/ui/button'

export default async function QuizBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: quiz, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !quiz) notFound()

  // Steps with their content blocks (questions), options, and branching —
  // each step is one screen in the player and can hold several blocks
  // stacked together (e.g. an Alert + a Multiple Choice on the same screen).
  const { data: rawSteps } = await supabase
    .from('quiz_steps')
    .select(`
      id,
      order_num,
      title,
      branching_rules,
      blocks:questions(
        id,
        title,
        description,
        type,
        order_num,
        settings,
        options:question_options(id, text, order_num, score_value, image_url)
      )
    `)
    .eq('quiz_id', id)
    .order('order_num', { ascending: true })

  const steps = (rawSteps || []).map((step) => ({
    ...step,
    blocks: [...(step.blocks || [])].sort((a, b) => a.order_num - b.order_num),
  }))

  // Flattened blocks, still used by the Leads and Funnel/Drop-off tabs which
  // report per-question, not per-step.
  const questions = steps.flatMap((s) => s.blocks)

  // Leads / Responses
  const { data: leads } = await supabase
    .from('leads_responses')
    .select(`
      id,
      name,
      phone,
      email,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      status,
      created_at,
      tags,
      answers:answers(
        id,
        question_id,
        text_value,
        option:question_options(text)
      )
    `)
    .eq('quiz_id', id)
    .order('created_at', { ascending: false })

  // Funnel metrics
  const { count: viewCount } = await supabase
    .from('quiz_views')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', id)

  const { count: startCount } = await supabase
    .from('leads_responses')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', id)

  const { count: completionCount } = await supabase
    .from('leads_responses')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', id)
    .eq('status', 'completed')

  // Drop-off data grouped by question
  const { data: rawDropoffs } = await supabase
    .from('quiz_dropoffs')
    .select('question_id, question_order')
    .eq('quiz_id', id)

  // Build drop-off summary per question
  const dropoffMap: Record<string, { count: number; order: number; title: string }> = {}
  if (rawDropoffs && questions) {
    rawDropoffs.forEach((d) => {
      const qId = d.question_id || `order_${d.question_order}`
      const qTitle = questions.find((q) => q.id === d.question_id)?.title || `Pergunta ${d.question_order + 1}`
      if (!dropoffMap[qId]) {
        dropoffMap[qId] = { count: 0, order: d.question_order, title: qTitle }
      }
      dropoffMap[qId].count++
    })
  }

  const dropoffByQuestion = Object.values(dropoffMap).map((d) => ({
    question_order: d.order,
    question_title: d.title,
    count: d.count,
  }))

  // Origem (UTM source) breakdown — counted from quiz_views, same source as
  // the top-of-funnel "Visualizações" number, grouped in JS following the
  // same small-scale pattern as dropoffMap above rather than a SQL GROUP BY.
  const { data: rawViews } = await supabase
    .from('quiz_views')
    .select('utm_source, device')
    .eq('quiz_id', id)

  const utmMap: Record<string, number> = {}
  const deviceMap: Record<string, number> = {}
  ;(rawViews || []).forEach((v) => {
    const source = v.utm_source || 'Direto / Desconhecido'
    utmMap[source] = (utmMap[source] || 0) + 1
    if (v.device) deviceMap[v.device] = (deviceMap[v.device] || 0) + 1
  })
  const utmBreakdown = Object.entries(utmMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
  const deviceBreakdown = Object.entries(deviceMap)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count)

  // Respostas por pergunta — for every answerable block, how many times
  // each of its options was picked. Joined through answers→question_options
  // rather than a raw count so image_choice/likert/multiple_choice all read
  // the same way; free-text blocks (text/numeric_calc) have no options to
  // group by and are skipped here — their volume is already visible via
  // dropoffByQuestion/leads.
  const optionBlockIds = questions.filter((q) => (q.options?.length ?? 0) > 0).map((q) => q.id)
  const { data: rawAnswers } = optionBlockIds.length > 0
    ? await supabase
        .from('answers')
        .select('question_id, option_id, option:question_options(text)')
        .in('question_id', optionBlockIds)
    : { data: [] as Array<{ question_id: string; option_id: string | null; option: { text: string } | null }> }

  const answersByQuestion: Record<string, Record<string, number>> = {}
  ;(rawAnswers || []).forEach((a) => {
    const optionText = (a as any).option?.text
    if (!a.question_id || !optionText) return
    if (!answersByQuestion[a.question_id]) answersByQuestion[a.question_id] = {}
    answersByQuestion[a.question_id][optionText] = (answersByQuestion[a.question_id][optionText] || 0) + 1
  })

  const responsesByQuestion = questions
    .filter((q) => answersByQuestion[q.id])
    .map((q) => ({
      question_title: q.title,
      options: Object.entries(answersByQuestion[q.id])
        .map(([option_text, count]) => ({ option_text, count }))
        .sort((a, b) => b.count - a.count),
    }))

  // Scored-result levels (the "ruler"), only relevant when configured
  const { data: resultLevels } = await supabase
    .from('quiz_result_levels')
    .select('id, name, description, min_score, max_score, color')
    .eq('quiz_id', id)
    .order('order_num', { ascending: true })

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">{quiz.title}</h1>
              <QuizStatusBadge status={quiz.status} />
            </div>
            <p className="text-zinc-400 text-xs mt-0.5">
              ID: <span className="font-mono text-zinc-500">{quiz.id}</span>
            </p>
          </div>
        </div>

        <a
          href={`/q/${quiz.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({
            variant: 'outline',
            className: 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 gap-1.5',
          })}
        >
          <ExternalLink className="h-4 w-4 text-indigo-400" />
          Abrir Player
        </a>
      </div>

      {/* Builder Tabs */}
      <Tabs defaultValue="questions" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex-wrap gap-1">
          <TabsTrigger value="questions"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2 rounded-lg text-xs font-medium">
            <ListOrdered className="h-4 w-4 text-indigo-400" />
            Etapas ({steps.length})
          </TabsTrigger>
          <TabsTrigger value="settings"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2 rounded-lg text-xs font-medium">
            <Settings className="h-4 w-4 text-cyan-400" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="result"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2 rounded-lg text-xs font-medium">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Resultado
          </TabsTrigger>
          <TabsTrigger value="funnel"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2 rounded-lg text-xs font-medium">
            <BarChart2 className="h-4 w-4 text-purple-400" />
            Funil & Drop-off
          </TabsTrigger>
          <TabsTrigger value="leads"
            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 gap-2 rounded-lg text-xs font-medium">
            <Users className="h-4 w-4 text-emerald-400" />
            Leads ({leads?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="focus-visible:outline-none">
          <QuestionsTab
            quizId={quiz.id}
            initialSteps={steps}
            scoringEnabled={quiz.enable_scored_result || false}
            quizStatus={quiz.status}
          />
        </TabsContent>

        <TabsContent value="settings" className="focus-visible:outline-none">
          <SettingsTab quiz={quiz} />
        </TabsContent>

        <TabsContent value="result" className="focus-visible:outline-none">
          <ResultLevelsTab
            quizId={quiz.id}
            initialEnabled={quiz.enable_scored_result || false}
            initialLevels={resultLevels || []}
            initialLoadingMessages={quiz.loading_messages || []}
          />
        </TabsContent>

        <TabsContent value="funnel" className="focus-visible:outline-none">
          <FunnelChart
            views={viewCount ?? 0}
            starts={startCount ?? 0}
            completions={completionCount ?? 0}
            leads={completionCount ?? 0}
            dropoffByQuestion={dropoffByQuestion}
            utmBreakdown={utmBreakdown}
            deviceBreakdown={deviceBreakdown}
            responsesByQuestion={responsesByQuestion}
          />
        </TabsContent>

        <TabsContent value="leads" className="focus-visible:outline-none">
          <LeadsTab leads={leads || []} questions={questions || []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
