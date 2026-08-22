-- ==============================================================================
-- Converte um quiz existente em Template reutilizável
-- Execute no SQL Editor do Supabase — uma vez por quiz que você quer virar
-- template. Troque as 5 variáveis no bloco `declare` e rode de novo para
-- cada um dos seus 3 quizzes.
-- ==============================================================================

do $$
declare
  -- ─── EDITE ESTES 5 VALORES ANTES DE RODAR ───────────────────────────────
  v_quiz_title text := 'TÍTULO EXATO DO QUIZ AQUI';   -- como aparece no dashboard
  v_template_name text := 'Nome do Template';          -- nome que vai aparecer na lista de templates
  v_template_description text := 'Descrição curta do que esse funil faz e pra quem serve.';
  v_template_category text := 'geral';                 -- uma de: skincare, educacao, marketing, geral
  v_template_emoji text := '📋';
  -- ──────────────────────────────────────────────────────────────────────

  v_quiz_id uuid;
  v_structure jsonb;
begin
  select id into v_quiz_id
  from public.quizzes
  where title = v_quiz_title
  order by created_at desc
  limit 1;

  if v_quiz_id is null then
    raise exception 'Nenhum quiz encontrado com o título "%". Confira o título exato no dashboard.', v_quiz_title;
  end if;

  -- Monta a estrutura completa: cada pergunta com suas opções (texto, imagem,
  -- pontuação) e settings (para blocos de conteúdo/comparativo) — o mesmo
  -- shape que createQuizFromTemplate espera ao aplicar o template depois.
  select jsonb_build_object(
    'questions', coalesce(jsonb_agg(
      jsonb_build_object(
        'title', q.title,
        'description', q.description,
        'type', q.type,
        'order_num', q.order_num,
        'settings', coalesce(q.settings, '{}'::jsonb),
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'text', o.text,
              'order_num', o.order_num,
              'score_value', o.score_value,
              'image_url', o.image_url
            )
            order by o.order_num
          )
          from public.question_options o
          where o.question_id = q.id
        ), '[]'::jsonb)
      )
      order by q.order_num
    ), '[]'::jsonb)
  )
  into v_structure
  from public.questions q
  where q.quiz_id = v_quiz_id;

  insert into public.quiz_templates (name, description, category, thumbnail_emoji, structure, is_active)
  values (v_template_name, v_template_description, v_template_category, v_template_emoji, v_structure, true);

  raise notice 'Template "%" criado a partir do quiz "%" (% perguntas).',
    v_template_name, v_quiz_title, jsonb_array_length(v_structure->'questions');
end $$;
