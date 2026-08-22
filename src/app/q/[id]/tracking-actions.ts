'use server'

import { createClient } from '@/utils/supabase/server'

export async function trackQuizView(quizId: string, utms: {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}) {
  const supabase = await createClient()
  await supabase.from('quiz_views').insert({
    quiz_id: quizId,
    utm_source: utms.utm_source || null,
    utm_medium: utms.utm_medium || null,
    utm_campaign: utms.utm_campaign || null,
  })
}

export async function trackQuizDropoff(quizId: string, questionId: string, questionOrder: number) {
  const supabase = await createClient()
  await supabase.from('quiz_dropoffs').insert({
    quiz_id: quizId,
    question_id: questionId,
    question_order: questionOrder,
  })
}
