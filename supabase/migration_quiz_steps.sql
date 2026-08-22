-- ==============================================================================
-- Migração: Etapas com múltiplos blocos (modelo estilo Inlead)
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Até agora, cada linha de `questions` era ao mesmo tempo um "bloco de
-- conteúdo" E uma "tela inteira" do player — order_num definia navegação e
-- branching_rules vivia por pergunta. Esta migração separa os dois
-- conceitos: `quiz_steps` passa a ser a tela (o que o player navega entre),
-- e `questions` passa a ser só o bloco de conteúdo dentro de uma etapa —
-- uma etapa pode conter vários blocos empilhados (ex: Alerta + Múltipla
-- Escolha + Imagem na mesma tela).

-- 1. Tabela de Etapas — o que o player efetivamente navega entre.
CREATE TABLE IF NOT EXISTS public.quiz_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    order_num INTEGER NOT NULL DEFAULT 0,
    title TEXT, -- rótulo interno opcional, só para organização no builder
    -- Formato idêntico ao antigo questions.branching_rules, mas agora
    -- referencia a próxima ETAPA, não a próxima pergunta:
    -- [{ "option_id": "uuid", "go_to_order": 3 }]
    -- option_id deve pertencer a um bloco de opções dentro deste step.
    branching_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.quiz_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros do workspace podem gerenciar etapas" ON public.quiz_steps;
CREATE POLICY "Membros do workspace podem gerenciar etapas"
    ON public.quiz_steps FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_steps.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_steps.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

DROP POLICY IF EXISTS "Público pode visualizar etapas de quizzes publicados" ON public.quiz_steps;
CREATE POLICY "Público pode visualizar etapas de quizzes publicados"
    ON public.quiz_steps FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_steps.quiz_id
        AND q.status = 'published'
    ));

CREATE INDEX IF NOT EXISTS idx_quiz_steps_quiz_id ON public.quiz_steps(quiz_id);

-- 2. Liga cada bloco (questions) à sua etapa.
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS step_id UUID REFERENCES public.quiz_steps(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_questions_step_id ON public.questions(step_id);

-- 3. Migração de dados existentes — cria 1 step por question já existente
--    que ainda não tenha step_id, preservando order_num e branching_rules,
--    para que nenhum quiz já publicado quebre. Idempotente: só processa
--    questions com step_id nulo, então rodar de novo não duplica nada.
DO $$
DECLARE
    q RECORD;
    new_step_id UUID;
BEGIN
    FOR q IN
        SELECT id, quiz_id, order_num, branching_rules
        FROM public.questions
        WHERE step_id IS NULL
        ORDER BY quiz_id, order_num
    LOOP
        INSERT INTO public.quiz_steps (quiz_id, order_num, branching_rules)
        VALUES (q.quiz_id, q.order_num, COALESCE(q.branching_rules, '[]'::jsonb))
        RETURNING id INTO new_step_id;

        UPDATE public.questions
        SET step_id = new_step_id, order_num = 0
        WHERE id = q.id;
    END LOOP;
END $$;

-- 4. branching_rules agora vive em quiz_steps — mantém a coluna antiga em
--    questions por enquanto (não remove/dropa) para servir de rollback
--    seguro; o código da aplicação para de lê-la a partir desta migração.
--    Pode ser removida numa limpeza futura, quando o novo modelo estiver
--    validado em produção.
