-- Versão direta: responde SIM/NÃO se cada tipo novo já está aceito pelo banco
select
  pg_get_constraintdef(oid) like '%timer%' as aceita_timer,
  pg_get_constraintdef(oid) like '%numeric_calc%' as aceita_numeric_calc,
  pg_get_constraintdef(oid) like '%image_choice%' as aceita_image_choice,
  pg_get_constraintdef(oid) like '%likert%' as aceita_likert,
  pg_get_constraintdef(oid) like '%content%' as aceita_content,
  pg_get_constraintdef(oid) like '%comparison%' as aceita_comparison
from pg_constraint
where conrelid = 'public.questions'::regclass
  and conname = 'questions_type_check';
