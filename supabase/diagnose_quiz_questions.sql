-- Lista os quizzes recentes e quantas perguntas cada um tem de verdade
select
  q.id,
  q.title,
  q.status,
  q.created_at,
  count(qs.id) as questions_count
from public.quizzes q
left join public.questions qs on qs.quiz_id = q.id
group by q.id, q.title, q.status, q.created_at
order by q.created_at desc
limit 15;
