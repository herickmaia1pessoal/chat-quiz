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

  // Questions with options and branching rules
  const { data: questions } = await supabase
    .from('questions')
    .select(`
      id,
      title,
      description,
      type,
      order_num,
      branching_rules,
      settings,
      options:question_options(id, text, order_num, score_value, image_url)
    `)
    .eq('quiz_id', id)
    .order('order_num', { ascending: true })

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
            Perguntas ({questions?.length || 0})
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
            initialQuestions={questions || []}
            scoringEnabled={quiz.enable_scored_result || false}
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
          />
        </TabsContent>

        <TabsContent value="leads" className="focus-visible:outline-none">
          <LeadsTab leads={leads || []} questions={questions || []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
