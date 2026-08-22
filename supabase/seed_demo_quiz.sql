-- ==============================================================================
-- Seed: Quiz de demonstração "Diagnóstico Rápido de Produtividade"
-- Cobre os 4 novos tipos de bloco: image_choice, likert, content, comparison
-- Execute no SQL Editor do Supabase (roda uma vez; não é idempotente —
-- rodar de novo cria um segundo quiz duplicado).
-- ==============================================================================

do $$
declare
  v_workspace_id uuid;
  v_quiz_id uuid;
  v_q1_id uuid;
  v_q2_id uuid;
  v_q3_id uuid;
  v_q4_id uuid;
begin
  -- Usa o workspace mais antigo existente no banco. Se você tem mais de um
  -- workspace e quer um específico, troque esta subquery por:
  -- select id into v_workspace_id from public.workspaces where name = 'Nome Exato';
  select id into v_workspace_id
  from public.workspaces
  order by created_at asc
  limit 1;

  if v_workspace_id is null then
    raise exception 'Nenhum workspace encontrado. Faça login no app pelo menos uma vez antes de rodar este seed.';
  end if;

  -- 1. Quiz
  insert into public.quizzes (workspace_id, title, description, status)
  values (
    v_workspace_id,
    'Diagnóstico Rápido de Produtividade',
    'Quiz de demonstração cobrindo os 4 novos tipos de bloco: imagem, Likert, interstício e comparativo.',
    'published'
  )
  returning id into v_quiz_id;

  -- 2. Bloco 1 — Opções com Imagem
  insert into public.questions (quiz_id, title, type, order_num)
  values (v_quiz_id, 'Você prefere trabalhar de manhã ou à noite?', 'image_choice', 0)
  returning id into v_q1_id;

  insert into public.question_options (question_id, text, order_num, image_url) values
    (v_q1_id, 'Manhã', 0, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400'),
    (v_q1_id, 'Noite', 1, 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400');

  -- 3. Bloco 2 — Escala de Concordância (Likert)
  insert into public.questions (quiz_id, title, type, order_num)
  values (v_quiz_id, 'Eu costumo adiar tarefas importantes', 'likert', 1)
  returning id into v_q2_id;

  insert into public.question_options (question_id, text, order_num, score_value) values
    (v_q2_id, 'Concordo totalmente', 0, 4),
    (v_q2_id, 'Concordo parcialmente', 1, 3),
    (v_q2_id, 'Neutro', 2, 2),
    (v_q2_id, 'Discordo parcialmente', 3, 1),
    (v_q2_id, 'Discordo totalmente', 4, 0);

  -- 4. Bloco 3 — Interstício de Conteúdo
  insert into public.questions (quiz_id, title, type, order_num, settings)
  values (
    v_quiz_id,
    'Um padrão ficou claro.',
    'content',
    2,
    jsonb_build_object(
      'body', 'Baseado nas suas respostas, você tem potencial para dobrar sua produtividade nos próximos 30 dias.',
      'testimonial_text', 'Depois que mudei minha rotina, entreguei o dobro em menos tempo.',
      'testimonial_author', 'Carlos, 34 anos',
      'cta_label', 'Continuar'
    )
  )
  returning id into v_q3_id;

  -- 5. Bloco 4 — Comparativo
  insert into public.questions (quiz_id, title, type, order_num, settings)
  values (
    v_quiz_id,
    'O que muda com um sistema de produtividade',
    'comparison',
    3,
    jsonb_build_object(
      'left_label', 'Sem sistema',
      'right_label', 'Com sistema',
      'rows', jsonb_build_array(
        jsonb_build_object('label', 'Foco', 'left_text', 'Distraído o dia todo', 'right_text', 'Blocos de foco profundo'),
        jsonb_build_object('label', 'Resultado', 'left_text', 'Tarefas acumuladas', 'right_text', 'Lista zerada')
      )
    )
  )
  returning id into v_q4_id;

  raise notice 'Quiz criado com sucesso! ID: %', v_quiz_id;
  raise notice 'Abra em: /q/%', v_quiz_id;
  raise notice 'Edite em: /dashboard/quiz/%', v_quiz_id;
end $$;
