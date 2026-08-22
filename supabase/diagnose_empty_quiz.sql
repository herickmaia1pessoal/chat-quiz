-- ==============================================================================
-- Diagnóstico: por que o quiz "Página de Oferta Pós-Resultado" ficou vazio
-- Execute no SQL Editor do Supabase (somente leitura, seguro rodar)
-- ==============================================================================

-- 1. Confirma se o quiz existe e quantas perguntas ele realmente tem
select
  q.id,
  q.title,
  q.status,
  q.created_at,
  count(qs.id) as questions_count
from public.quizzes q
left join public.questions qs on qs.quiz_id = q.id
where q.title ilike '%Página de Oferta%'
group by q.id, q.title, q.status, q.created_at
order by q.created_at desc;

-- 2. Confirma se o banco já aceita os tipos usados no template
--    (se 'timer' e 'numeric_calc' não aparecerem aqui, a migration
--    migration_timer_numeric.sql não foi aplicada com sucesso)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.questions'::regclass
  and conname = 'questions_type_check';
