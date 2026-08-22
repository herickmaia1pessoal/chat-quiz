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

interface QuestionInput {
  id?: string
  title: string
  description?: string
  type: string
  order_num: number
  // Legacy field, still accepted for backwards compatibility with callers
  // that haven't migrated to step-level branching yet (see StepInput below).
  branching_rules?: Array<{ option_id: string; go_to_order: number }>
  options?: Array<{ id?: string; text: string; order_num: number; score_value?: number; image_url?: string }>
  settings?: Record<string, any>
}

interface StepInput {
  id?: string
  order_num: number
  title?: string
  branching_rules?: Array<{ option_id: string; go_to_order: number }>
  blocks: QuestionInput[]
}

// Accepts either the new grouped shape (one step = one screen, containing N
// content blocks) or the legacy flat shape (one question = one screen) for
// callers not migrated yet. Flat input is wrapped as one block per step so
// existing behavior — and existing quizzes' saved data — doesn't change.
export async function saveQuestions(quizId: string, input: StepInput[] | QuestionInput[]) {
  const supabase = await createClient()

  const steps: StepInput[] = isFlatQuestionInput(input)
    ? input.map((q, i) => ({ order_num: i, branching_rules: q.branching_rules, blocks: [q] }))
    : input

  // Delete existing steps — cascades to questions (step_id FK) which cascades
  // to question_options, same as the old direct questions delete did.
  await supabase.from('quiz_steps').delete().eq('quiz_id', quizId)

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]
    const { data: createdStep, error: stepError } = await supabase
      .from('quiz_steps')
      .insert({
        quiz_id: quizId,
        order_num: stepIndex,
        title: step.title || null,
        branching_rules: step.branching_rules || [],
      })
      .select()
      .single()

    if (stepError) throw new Error(stepError.message)

    for (let blockIndex = 0; blockIndex < step.blocks.length; blockIndex++) {
      const q = step.blocks[blockIndex]
      const { data: createdQuestion, error: qError } = await supabase
        .from('questions')
        .insert({
          quiz_id: quizId,
          step_id: createdStep.id,
          title: q.title,
          description: q.description || '',
          type: q.type,
          order_num: blockIndex,
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
  }

  revalidatePath(`/dashboard/quiz/${quizId}`)
}

function isFlatQuestionInput(input: StepInput[] | QuestionInput[]): input is QuestionInput[] {
  return input.length === 0 || !('blocks' in input[0])
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

  const { data: steps } = await supabase
    .from('quiz_steps')
    .select('id, order_num, title, branching_rules, questions(id, title, description, type, order_num, settings, options:question_options(id, text, order_num, score_value, image_url))')
    .eq('quiz_id', quizId)
    .order('order_num', { ascending: true })

  // Branching rules reference option_id values from the *original* quiz's
  // options — those rows don't exist in the copy, so every rule needs its
  // option_id rewritten to the newly-created option's id or it would
  // silently never match once the copy is played. Rules are stashed here
  // and remapped in a second pass, once every option in the quiz has been
  // copied (a rule can point at an option from earlier step in the same quiz).
  const optionIdMap: Record<string, string> = {}
  const stepBranchingToFix: Array<{ newStepId: string; rules: Array<{ option_id: string; go_to_order: number }> }> = []

  for (const step of steps || []) {
    const { data: createdStep, error: stepInsertError } = await supabase
      .from('quiz_steps')
      .insert({
        quiz_id: newQuiz.id,
        order_num: step.order_num,
        title: step.title,
        // Rewritten in a second pass below, once all option ids exist.
        branching_rules: [],
      })
      .select()
      .single()

    if (stepInsertError || !createdStep) continue

    const blocks = (step as any).questions as Array<{ id: string; title: string; description?: string; type: string; order_num: number; settings?: Record<string, any>; options: Array<{ id: string; text: string; order_num: number; score_value?: number; image_url?: string }> | null }>

    for (const block of blocks || []) {
      const { data: createdQuestion } = await supabase
        .from('questions')
        .insert({
          quiz_id: newQuiz.id,
          step_id: createdStep.id,
          title: block.title,
          description: block.description || '',
          type: block.type,
          order_num: block.order_num,
          settings: block.settings || {},
        })
        .select()
        .single()

      if (!createdQuestion) continue

      if (block.options && block.options.length > 0) {
        for (const opt of block.options) {
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
    }

    // Stash the original step's branching rules alongside the new step id
    // so they can be remapped once every option in the quiz has been copied
    // (a rule can reference an option from an earlier step in the same quiz).
    if (step.branching_rules && step.branching_rules.length > 0) {
      stepBranchingToFix.push({ newStepId: createdStep.id, rules: step.branching_rules })
    }
  }

  for (const { newStepId, rules } of stepBranchingToFix) {
    const remapped = rules
      .filter((r) => optionIdMap[r.option_id] !== undefined)
      .map((r) => ({ option_id: optionIdMap[r.option_id], go_to_order: r.go_to_order }))

    await supabase.from('quiz_steps').update({ branching_rules: remapped }).eq('id', newStepId)
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

export async function deleteQuiz(quizId: string) {
  const supabase = await createClient()

  // RLS already scopes deletes to quizzes in workspaces the caller belongs
  // to, but an explicit not-found/denied check gives a clearer error than a
  // silent no-op delete would (Supabase doesn't error when RLS filters a
  // delete down to zero matched rows).
  const { data, error } = await supabase
    .from('quizzes')
    .delete()
    .eq('id', quizId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Quiz não encontrado ou sem permissão para excluir.')

  revalidatePath('/dashboard')
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
