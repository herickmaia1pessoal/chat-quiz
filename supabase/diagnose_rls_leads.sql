-- Lista as policies de INSERT/UPDATE ativas hoje na tabela leads_responses
select
  policyname,
  cmd as operacao,
  qual as condicao_using,
  with_check as condicao_with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'leads_responses'
order by cmd;
