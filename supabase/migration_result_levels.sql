-- ==============================================================================
-- Migração: Resultado Calculado com Régua de Níveis (Idempotente)
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- 1. Pontuação por opção de resposta — usada para somar a pontuação total do
--    lead e determinar em qual nível de resultado ele cai.
ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS score_value INTEGER NOT NULL DEFAULT 0;

-- 2. Liga/desliga o recurso de resultado calculado por quiz — quizzes
--    existentes continuam funcionando exatamente como antes (tela de
--    "obrigado" simples) até o usuário configurar níveis e ativar isto.
--
--    loading_messages: array de strings exibidas em sequência na tela de
--    "processando resultado" que aparece antes de revelar o nível (ex:
--    ["Cruzando suas respostas...", "Comparando com outras pessoas..."]).
--    Segue o mesmo padrão de `theme`/`branching_rules` já usado neste schema:
--    conteúdo pequeno, sempre lido/escrito junto com o resto do quiz, sem
--    justificar uma tabela própria.
ALTER TABLE public.quizzes
    ADD COLUMN IF NOT EXISTS enable_scored_result BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS loading_messages JSONB NOT NULL DEFAULT '["Calculando seu resultado..."]'::jsonb;

-- 3. Níveis de resultado (a "régua") — cada quiz com o recurso ativo define
--    de 2 a N faixas de pontuação, cada uma com nome, descrição e cor.
--    Ex: Preso Profundo (0-25) → Ciclo Ativo (26-50) → Rompendo (51-75) → Quase Livre (76-100)
CREATE TABLE IF NOT EXISTS public.quiz_result_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_score INTEGER NOT NULL DEFAULT 0,
    max_score INTEGER NOT NULL DEFAULT 100,
    color TEXT NOT NULL DEFAULT '#f59e0b',
    order_num INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.quiz_result_levels ENABLE ROW LEVEL SECURITY;

-- Membros do workspace gerenciam os níveis do próprio quiz
DROP POLICY IF EXISTS "Membros podem gerenciar níveis de resultado" ON public.quiz_result_levels;
CREATE POLICY "Membros podem gerenciar níveis de resultado"
    ON public.quiz_result_levels FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_result_levels.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_result_levels.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

-- Público pode ler os níveis de quizzes publicados (necessário para o player
-- calcular e exibir o resultado sem estar autenticado)
DROP POLICY IF EXISTS "Público pode ver níveis de quizzes publicados" ON public.quiz_result_levels;
CREATE POLICY "Público pode ver níveis de quizzes publicados"
    ON public.quiz_result_levels FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_result_levels.quiz_id
        AND q.status = 'published'
    ));

-- 4. Guarda a pontuação final e o nível atingido na sessão do lead, para
--    aparecer na aba de Leads do builder sem precisar recalcular depois.
ALTER TABLE public.leads_responses
    ADD COLUMN IF NOT EXISTS total_score INTEGER,
    ADD COLUMN IF NOT EXISTS result_level_id UUID REFERENCES public.quiz_result_levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_result_levels_quiz_id ON public.quiz_result_levels(quiz_id);
