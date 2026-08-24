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
  // The client already checks this (quiz-player.tsx's handleSubmitLead),
  // but that's just UX — this is a public server action anyone can call
  // directly with a forged fetch, bypassing the form entirely. Without a
  // server-side check, leads_responses could end up with a phone like "a"
  // or an unparseable email, silently corrupting export/webhook data.
  const phoneDigits = (payload.phone || '').replace(/\D/g, '')
  if (!payload.name?.trim() || phoneDigits.length < 10 || phoneDigits.length > 15) {
    throw new Error('Nome e telefone válidos são obrigatórios.')
  }
  if (payload.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    throw new Error('Informe um e-mail válido.')
  }

  const supabase = await createClient()

  // 1. Fetch Quiz config (for webhook_url, redirect_url, the scored-result
  // toggle, and the lead-deduplication key)
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('webhook_url, redirect_url, title, enable_scored_result, identity_field')
    .eq('id', payload.quizId)
    .single()

  // 2. Calculate the score server-side from the DB's own score_value per
  // option — never trust a score computed on the client, since the payload
  // is just a plain fetch call anyone could forge with arbitrary numbers.
  type ResultLevel = { id: string; name: string; description: string | null; color: string; min_score: number; max_score: number }

  let totalScore: number | null = null
  let resultLevel: ResultLevel | null = null
  let allLevels: ResultLevel[] = []

  const optionIds = payload.answers.map((a) => a.optionId).filter((id): id is string => !!id)

  // Tags are collected regardless of whether scoring is enabled — they're
  // an independent feature (lead segmentation), not tied to the score ruler.
  let leadTags: string[] = []
  if (optionIds.length > 0) {
    const { data: taggedOptions } = await supabase
      .from('question_options')
      .select('id, tag')
      .in('id', optionIds)
      .not('tag', 'is', null)

    leadTags = [...new Set((taggedOptions || []).map((o) => o.tag).filter((t): t is string => !!t))]
  }

  if (quiz?.enable_scored_result) {
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

  // 3. Deduplicate by the quiz's configured identity field — if the same
  // person answers again (e.g. reopened the link), update their existing
  // session instead of creating a second lead, so "Leads Gerados" doesn't
  // get inflated by repeat submissions. Phone is compared digits-only since
  // formatting varies ("(11) 99999-9999" vs "11999999999"); email/name are
  // compared trimmed + lowercased. 'none' (the default) keeps the old
  // behavior — every submission is its own lead.
  const identityField = quiz?.identity_field || 'none'
  let existingLeadId: string | null = null

  if (identityField !== 'none') {
    const normalizedPhone = payload.phone.replace(/\D/g, '')
    const normalizedEmail = payload.email?.trim().toLowerCase()
    const normalizedName = payload.name?.trim().toLowerCase()

    let query = supabase.from('leads_responses').select('id').eq('quiz_id', payload.quizId)

    if (identityField === 'phone' && normalizedPhone) {
      // Compare against the same digits-only normalization applied on write
      // (see the insert/update payload below) rather than raw stored text.
      query = query.eq('phone', normalizedPhone)
    } else if (identityField === 'email' && normalizedEmail) {
      query = query.eq('email', normalizedEmail)
    } else if (identityField === 'name' && normalizedName) {
      query = query.ilike('name', normalizedName)
    } else {
      query = null as any // no usable value to match on for this identity field
    }

    if (query) {
      const { data: existing } = await query.limit(1).maybeSingle()
      if (existing) existingLeadId = existing.id
    }
  }

  // The id is generated here (for new leads) rather than read back via
  // .select()/RETURNING. In Postgres, INSERT ... RETURNING re-checks the
  // table's SELECT policies on the new row before handing it back, and the
  // only SELECT policy on leads_responses requires workspace membership —
  // something an anonymous quiz visitor never has. That combination made
  // every public submission fail with "new row violates row-level security
  // policy" even though the INSERT itself was correctly permitted. Supplying
  // our own id sidesteps the RETURNING requirement entirely, so we don't
  // have to widen SELECT access (and leak every quiz's leads) to fix it.
  const leadId = existingLeadId || crypto.randomUUID()
  const completedAt = new Date().toISOString()

  const leadRow = {
    quiz_id: payload.quizId,
    name: payload.name,
    // Stored normalized (digits-only) when phone is the identity key, so
    // the next dedup lookup's .eq('phone', ...) compares like-for-like.
    phone: identityField === 'phone' ? payload.phone.replace(/\D/g, '') : payload.phone,
    email: identityField === 'email' ? (payload.email?.trim().toLowerCase() || null) : (payload.email || null),
    utm_source: payload.utms.utm_source || null,
    utm_medium: payload.utms.utm_medium || null,
    utm_campaign: payload.utms.utm_campaign || null,
    utm_content: payload.utms.utm_content || null,
    utm_term: payload.utms.utm_term || null,
    status: 'completed',
    completed_at: completedAt,
    total_score: totalScore,
    result_level_id: resultLevel?.id || null,
    tags: leadTags,
  }

  const { error: leadError } = existingLeadId
    ? await supabase.from('leads_responses').update(leadRow).eq('id', leadId)
    : await supabase.from('leads_responses').insert({ id: leadId, ...leadRow })

  if (leadError) {
    console.error('Error saving lead:', leadError)
    throw new Error('Falha ao registrar lead.')
  }

  // 4. Insert individual answers — for a deduplicated resubmission, the
  // previous answers are replaced wholesale rather than accumulated,
  // mirroring the delete-then-reinsert pattern already used by
  // saveQuestions for editing a quiz's own structure.
  if (existingLeadId) {
    await supabase.from('answers').delete().eq('response_id', leadId)
  }

  if (payload.answers.length > 0) {
    const answersToInsert = payload.answers.map((ans) => ({
      response_id: leadId,
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
          id: leadId,
          name: payload.name,
          phone: payload.phone,
          email: payload.email || null,
          created_at: completedAt,
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
