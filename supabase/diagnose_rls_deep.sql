-- 1. RLS está mesmo habilitado, e é forçado até para o dono da tabela?
select relname, relrowsecurity as rls_habilitado, relforcerowsecurity as rls_forcado
from pg_class
where relname = 'leads_responses';

-- 2. Todas as policies, com role e tipo (permissive/restrictive) explícitos
select
  policyname,
  permissive,
  roles,
  cmd as operacao,
  qual as condicao_using,
  with_check as condicao_with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'leads_responses';

-- 3. Existe algum trigger na tabela que possa estar disparando o erro
--    indiretamente (ex: gravando em outra tabela mais restritiva)?
select tgname as trigger_name, tgenabled as habilitado
from pg_trigger
where tgrelid = 'public.leads_responses'::regclass
  and not tgisinternal;
