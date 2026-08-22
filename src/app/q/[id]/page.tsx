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

  // Fetch Questions and their options ordered
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
      options:question_options(id, text, order_num, image_url)
    `)
    .eq('quiz_id', id)
    .order('order_num', { ascending: true })

  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Carregando quiz...</div>}>
      <QuizPlayer quiz={quiz} questions={questions || []} />
    </Suspense>
  )
}
