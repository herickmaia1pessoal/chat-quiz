'use server'

import { createClient } from '@/utils/supabase/server'

interface SubmitPayload {
  quizId: string
  name: string
  phone: string
  email?: string
  utms: {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
  }
  answers: Array<{
    questionId: string
    questionTitle: string
    optionId?: string
    optionText?: string
    textValue?: string
  }>
}

export async function submitQuizResponse(payload: SubmitPayload) {
  const supabase = await createClient()

  // 1. Fetch Quiz config (for webhook_url, redirect_url and the scored-result toggle)
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('webhook_url, redirect_url, title, enable_scored_result')
    .eq('id', payload.quizId)
    .single()

  // 2. Calculate the score server-side from the DB's own score_value per
  // option — never trust a score computed on the client, since the payload
  // is just a plain fetch call anyone could forge with arbitrary numbers.
  type ResultLevel = { id: string; name: string; description: string | null; color: string; min_score: number; max_score: number }

  let totalScore: number | null = null
  let resultLevel: ResultLevel | null = null
  let allLevels: ResultLevel[] = []

  if (quiz?.enable_scored_result) {
    const optionIds = payload.answers.map((a) => a.optionId).filter((id): id is string => !!id)

    if (optionIds.length > 0) {
      const { data: scoredOptions } = await supabase
        .from('question_options')
        .select('id, score_value')
        .in('id', optionIds)

      totalScore = (scoredOptions || []).reduce((sum, opt) => sum + (opt.score_value || 0), 0)
    } else {
      totalScore = 0
    }

    const { data: levels } = await supabase
      .from('quiz_result_levels')
      .select('id, name, description, color, min_score, max_score')
      .eq('quiz_id', payload.quizId)
      .order('order_num', { ascending: true })

    allLevels = levels || []
    resultLevel = allLevels.find((l) => totalScore! >= l.min_score && totalScore! <= l.max_score) || null
  }

  // 3. Insert Lead session
  const { data: leadResponse, error: leadError } = await supabase
    .from('leads_responses')
    .insert({
      quiz_id: payload.quizId,
      name: payload.name,
      phone: payload.phone,
      email: payload.email || null,
      utm_source: payload.utms.utm_source || null,
      utm_medium: payload.utms.utm_medium || null,
      utm_campaign: payload.utms.utm_campaign || null,
      utm_content: payload.utms.utm_content || null,
      utm_term: payload.utms.utm_term || null,
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_score: totalScore,
      result_level_id: resultLevel?.id || null,
    })
    .select()
    .single()

  if (leadError || !leadResponse) {
    console.error('Error saving lead:', leadError)
    throw new Error('Falha ao registrar lead.')
  }

  // 4. Insert individual answers
  if (payload.answers.length > 0) {
    const answersToInsert = payload.answers.map((ans) => ({
      response_id: leadResponse.id,
      question_id: ans.questionId,
      option_id: ans.optionId || null,
      text_value: ans.optionText || ans.textValue || null,
    }))

    await supabase.from('answers').insert(answersToInsert)
  }

  // 5. Trigger Webhook to external automations (n8n, Evolution API, CRMs)
  if (quiz?.webhook_url) {
    try {
      const webhookBody = {
        event: 'quiz.completed',
        quiz_id: payload.quizId,
        quiz_title: quiz.title,
        lead: {
          id: leadResponse.id,
          name: payload.name,
          phone: payload.phone,
          email: payload.email || null,
          created_at: leadResponse.created_at,
        },
        utms: payload.utms,
        answers: payload.answers.map((a) => ({
          question: a.questionTitle,
          answer: a.optionText || a.textValue || '',
        })),
        result: resultLevel
          ? { level: resultLevel.name, score: totalScore }
          : null,
      }

      await fetch(quiz.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'QuizFlow-Webhook-Engine/1.0',
        },
        body: JSON.stringify(webhookBody),
      })
    } catch (whError) {
      console.error('Failed to dispatch webhook:', whError)
    }
  }

  return {
    success: true,
    redirectUrl: quiz?.redirect_url || null,
    result: resultLevel
      ? {
          // totalScore is only ever null when resultLevel is also null (the
          // scoring branch above didn't run), so this fallback never
          // actually fires — it just satisfies the type since TS can't
          // correlate the two independently-typed variables.
          score: totalScore ?? 0,
          levelName: resultLevel.name,
          levelDescription: resultLevel.description,
          levelColor: resultLevel.color,
          // Full ladder so the player can draw the "you are here" scale —
          // not just the level reached, since the ruler shows every stage.
          allLevels: allLevels.map((l) => ({ name: l.name, minScore: l.min_score, maxScore: l.max_score, color: l.color })),
        }
      : null,
  }
}
