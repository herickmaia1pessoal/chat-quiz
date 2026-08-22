-- ==============================================================================
-- Migração: Tag por Opção de Resposta
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Ao lado de score_value (pontuação), cada opção de resposta agora pode
-- carregar uma "tag" livre (ex: "vip", "quente", "sem-budget") — usada pra
-- marcar o lead automaticamente quando ele escolhe aquela opção. Segue o
-- mesmo padrão simples de score_value: coluna de texto na própria opção,
-- sem tabela nova.
ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS tag TEXT;

-- Agregado de todas as tags das opções escolhidas por um lead, num único
-- array — populado no momento do envio (submitQuizResponse), evitando um
-- join toda vez que a lista de Leads precisar exibir as tags de alguém.
ALTER TABLE public.leads_responses
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
