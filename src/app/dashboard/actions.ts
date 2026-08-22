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

export async function duplicateQuiz(quizId: string) {
  const supabase = await createClient()

  const { data: original, error: qError } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .single()

  if (qError || !original) throw new Error('Quiz não encontrado.')

  // New quiz always starts as draft/unpublished, regardless of the
  // original's status — a copy shouldn't go live silently, and its own
  // tracking/lead history must start clean rather than continue the
  // original's numbers.
  const { data: newQuiz, error: insertError } = await supabase
    .from('quizzes')
    .insert({
      workspace_id: original.workspace_id,
      title: `${original.title} (cópia)`,
      description: original.description,
      status: 'draft',
      meta_pixel_id: original.meta_pixel_id,
      ga4_measurement_id: original.ga4_measurement_id,
      webhook_url: original.webhook_url,
      redirect_url: original.redirect_url,
      show_branding: original.show_branding,
      enable_scored_result: original.enable_scored_result,
      loading_messages: original.loading_messages,
    })
    .select()
    .single()

  if (insertError || !newQuiz) throw new Error('Erro ao duplicar quiz.')

  const { data: questions } = await supabase
    .from('questions')
    .select('id, title, description, type, order_num, branching_rules, settings, options:question_options(id, text, order_num, score_value, image_url)')
    .eq('quiz_id', quizId)
    .order('order_num', { ascending: true })

  // Branching rules reference option_id values from the *original* quiz's
  // options — those rows don't exist in the copy, so every rule needs its
  // option_id rewritten to the newly-created option's id or it would
  // silently never match once the copy is played. Rules are stashed here
  // and remapped in a second pass, once every option in the quiz has been
  // copied (a rule can point at an option from earlier in the same quiz).
  const optionIdMap: Record<string, string> = {}
  const questionBranchingToFix: Array<{ newQuestionId: string; rules: Array<{ option_id: string; go_to_order: number }> }> = []

  for (const q of questions || []) {
    const { data: createdQuestion, error: qInsertError } = await supabase
      .from('questions')
      .insert({
        quiz_id: newQuiz.id,
        title: q.title,
        description: q.description || '',
        type: q.type,
        order_num: q.order_num,
        settings: q.settings || {},
        // Rewritten in a second pass below, once all option ids exist.
        branching_rules: [],
      })
      .select()
      .single()

    if (qInsertError || !createdQuestion) continue

    const options = (q as any).options as Array<{ id: string; text: string; order_num: number; score_value?: number; image_url?: string }> | null
    if (options && options.length > 0) {
      for (const opt of options) {
        const { data: createdOption } = await supabase
          .from('question_options')
          .insert({
            question_id: createdQuestion.id,
            text: opt.text,
            order_num: opt.order_num,
            score_value: opt.score_value || 0,
            image_url: opt.image_url || null,
          })
          .select('id')
          .single()

        if (createdOption) optionIdMap[opt.id] = createdOption.id
      }
    }

    // Stash the original branching rules alongside the new question id so
    // they can be remapped once every option in the quiz has been copied
    // (a rule can reference an option from earlier in the same quiz).
    if (q.branching_rules && q.branching_rules.length > 0) {
      questionBranchingToFix.push({ newQuestionId: createdQuestion.id, rules: q.branching_rules })
    }
  }

  for (const { newQuestionId, rules } of questionBranchingToFix) {
    const remapped = rules
      .filter((r) => optionIdMap[r.option_id] !== undefined)
      .map((r) => ({ option_id: optionIdMap[r.option_id], go_to_order: r.go_to_order }))

    await supabase.from('questions').update({ branching_rules: remapped }).eq('id', newQuestionId)
  }

  const { data: levels } = await supabase
    .from('quiz_result_levels')
    .select('name, description, min_score, max_score, color, order_num')
    .eq('quiz_id', quizId)

  if (levels && levels.length > 0) {
    await supabase.from('quiz_result_levels').insert(
      levels.map((l) => ({ ...l, quiz_id: newQuiz.id }))
    )
  }

  revalidatePath('/dashboard')
  return newQuiz
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
