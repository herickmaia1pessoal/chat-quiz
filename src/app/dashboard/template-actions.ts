'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createQuizFromTemplate(workspaceId: string, templateId: string) {
  const supabase = await createClient()

  // 1. Fetch template
  const { data: template, error: tError } = await supabase
    .from('quiz_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (tError || !template) throw new Error('Template não encontrado.')

  // 2. Create quiz from template
  const { data: quiz, error: qError } = await supabase
    .from('quizzes')
    .insert({
      workspace_id: workspaceId,
      title: template.name,
      description: template.description,
      status: 'draft',
    })
    .select()
    .single()

  if (qError || !quiz) throw new Error('Erro ao criar quiz.')

  // 3. Insert questions from template structure — carries every field a
  // question/option can have, not just title/text/order_num. Templates built
  // from the newer block types (image_choice, likert, content, comparison)
  // rely on image_url, score_value, settings, and branching_rules surviving
  // the copy, or they'd silently lose their images/scoring/narrative content
  // the moment someone applied the template.
  const templateQuestions = (template.structure?.questions || []) as Array<{
    title: string
    description?: string
    type: string
    order_num: number
    branching_rules?: Array<{ option_id: string; go_to_order: number }>
    settings?: Record<string, any>
    options?: Array<{ text: string; order_num: number; score_value?: number; image_url?: string }>
  }>

  const failedQuestions: string[] = []

  for (const q of templateQuestions) {
    const { data: createdQ, error: qInsertError } = await supabase
      .from('questions')
      .insert({
        quiz_id: quiz.id,
        title: q.title,
        description: q.description || '',
        type: q.type,
        order_num: q.order_num,
        // Branching rules reference option_id values from the template's own
        // structure, which don't exist as real rows yet — they're dropped
        // here rather than copied verbatim, since a rule pointing at a
        // nonexistent option would silently never match in the player.
        branching_rules: [],
        settings: q.settings || {},
      })
      .select()
      .single()

    // Previously this failure was swallowed silently (`continue` with no
    // record kept) — a template using a block type the DB's CHECK
    // constraint didn't accept yet (e.g. 'timer'/'numeric_calc' before
    // their migration ran) would insert zero questions and hand back a
    // seemingly successful, but completely empty, quiz. The player then
    // has no questions to show and jumps straight to lead capture with no
    // indication anything went wrong.
    if (qInsertError || !createdQ) {
      console.error(`Failed to insert template question "${q.title}" (type: ${q.type}):`, qInsertError)
      failedQuestions.push(`${q.title} (${q.type})`)
      continue
    }

    if (q.options && q.options.length > 0) {
      await supabase.from('question_options').insert(
        q.options.map((opt, i) => ({
          question_id: createdQ.id,
          text: opt.text,
          order_num: i,
          score_value: opt.score_value || 0,
          image_url: opt.image_url || null,
        }))
      )
    }
  }

  if (failedQuestions.length > 0) {
    throw new Error(
      `O quiz foi criado, mas ${failedQuestions.length} pergunta(s) do template não puderam ser adicionadas: ${failedQuestions.join(', ')}. ` +
      `Isso costuma acontecer quando uma migração do banco ainda não foi aplicada. Delete o quiz "${quiz.title}" e tente novamente após aplicar as migrações pendentes.`
    )
  }

  revalidatePath('/dashboard')
  return quiz
}
