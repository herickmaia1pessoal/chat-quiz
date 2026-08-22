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

  // 3. Insert questions from template structure
  const templateQuestions = (template.structure?.questions || []) as Array<{
    title: string
    description?: string
    type: string
    order_num: number
    options?: Array<{ text: string; order_num: number }>
  }>

  for (const q of templateQuestions) {
    const { data: createdQ, error: qInsertError } = await supabase
      .from('questions')
      .insert({
        quiz_id: quiz.id,
        title: q.title,
        description: q.description || '',
        type: q.type,
        order_num: q.order_num,
        branching_rules: [],
      })
      .select()
      .single()

    if (qInsertError || !createdQ) continue

    if (q.options && q.options.length > 0) {
      await supabase.from('question_options').insert(
        q.options.map((opt, i) => ({
          question_id: createdQ.id,
          text: opt.text,
          order_num: i,
        }))
      )
    }
  }

  revalidatePath('/dashboard')
  return quiz
}
