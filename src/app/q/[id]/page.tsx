import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { QuizPlayer } from '@/components/player/quiz-player'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('title, description')
    .eq('id', id)
    .single()

  if (!quiz) return { title: 'Quiz não encontrado' }

  return {
    title: `${quiz.title} | QuizFlow`,
    description: quiz.description || 'Responda a esta rápida avaliação.',
  }
}

export default async function PublicQuizPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch Quiz — only published quizzes are accessible publicly.
  // The .eq('status', 'published') works as the primary gate so the page
  // renders correctly even when the anonymous RLS policy is missing.
  const { data: quiz, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !quiz) {
    notFound()
  }

  // Fetch Steps and their content blocks — each step is one screen the
  // player navigates between, and can hold several blocks stacked together
  // (e.g. an Alert + a Multiple Choice question on the same screen).
  const { data: steps } = await supabase
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
        options:question_options(id, text, order_num, image_url)
      )
    `)
    .eq('quiz_id', id)
    .order('order_num', { ascending: true })

  // Blocks come back unordered relative to each other from the nested
  // select — sort them by their own order_num within the step.
  const orderedSteps = (steps || []).map((step) => ({
    ...step,
    blocks: [...(step.blocks || [])].sort((a, b) => a.order_num - b.order_num),
  }))

  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Carregando quiz...</div>}>
      <QuizPlayer quiz={quiz} steps={orderedSteps} />
    </Suspense>
  )
}
