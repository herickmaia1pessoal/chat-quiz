'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function createWorkspace(formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('name') as string

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      owner_id: user.id,
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/dashboard')
  return data
}

export async function createQuiz(formData: FormData) {
  const supabase = await createClient()
  const workspace_id = formData.get('workspace_id') as string
  const title = formData.get('title') as string
  const description = formData.get('description') as string

  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      workspace_id,
      title,
      description,
      status: 'draft'
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/dashboard')
  return data
}

export async function updateQuizSettings(quizId: string, settings: {
  title?: string
  description?: string
  meta_pixel_id?: string
  ga4_measurement_id?: string
  webhook_url?: string
  redirect_url?: string
  status?: 'draft' | 'published' | 'archived'
  show_branding?: boolean
  enable_scored_result?: boolean
  loading_messages?: string[]
}) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('quizzes')
    .update({
      ...settings,
      updated_at: new Date().toISOString()
    })
    .eq('id', quizId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/dashboard/quiz/${quizId}`)
  revalidatePath('/dashboard')
}

export async function saveQuestions(quizId: string, questions: Array<{
  id?: string
  title: string
  description?: string
  type: string
  order_num: number
  branching_rules?: Array<{ option_id: string; go_to_order: number }>
  options?: Array<{ id?: string; text: string; order_num: number; score_value?: number; image_url?: string }>
  settings?: Record<string, any>
}>) {
  const supabase = await createClient()

  // First delete existing questions (cascade will remove options)
  await supabase.from('questions').delete().eq('quiz_id', quizId)

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const { data: createdQuestion, error: qError } = await supabase
      .from('questions')
      .insert({
        quiz_id: quizId,
        title: q.title,
        description: q.description || '',
        type: q.type,
        order_num: i,
        branching_rules: q.branching_rules || [],
        settings: q.settings || {},
      })
      .select()
      .single()

    if (qError) throw new Error(qError.message)

    if (q.options && q.options.length > 0 && createdQuestion) {
      const optionsToInsert = q.options.map((opt, optIndex) => ({
        question_id: createdQuestion.id,
        text: opt.text,
        order_num: optIndex,
        score_value: opt.score_value || 0,
        image_url: opt.image_url || null,
      }))

      const { error: optError } = await supabase
        .from('question_options')
        .insert(optionsToInsert)

      if (optError) throw new Error(optError.message)
    }
  }

  revalidatePath(`/dashboard/quiz/${quizId}`)
}

export async function saveResultLevels(quizId: string, levels: Array<{
  id?: string
  name: string
  description?: string
  min_score: number
  max_score: number
  color: string
}>) {
  const supabase = await createClient()

  // Same delete-then-reinsert approach as saveQuestions — levels are edited
  // as a whole set in the builder, so there's no need for per-row diffing.
  await supabase.from('quiz_result_levels').delete().eq('quiz_id', quizId)

  if (levels.length > 0) {
    const levelsToInsert = levels.map((level, index) => ({
      quiz_id: quizId,
      name: level.name,
      description: level.description || '',
      min_score: level.min_score,
      max_score: level.max_score,
      color: level.color,
      order_num: index,
    }))

    const { error } = await supabase.from('quiz_result_levels').insert(levelsToInsert)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/dashboard/quiz/${quizId}`)
}
