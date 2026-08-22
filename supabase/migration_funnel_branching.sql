-- ==============================================================================
-- Migração: Funil de Conversão, Drop-off e Lógica Condicional
-- Execute no SQL Editor do Supabase
-- ==============================================================================

-- 1. Rastreamento de visualizações do quiz (para o topo do funil)
CREATE TABLE IF NOT EXISTS public.quiz_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.quiz_views ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode registrar uma visualização (público)
CREATE POLICY "Público pode registrar views"
    ON public.quiz_views FOR INSERT
    WITH CHECK (true);

-- Membros do workspace podem visualizar as métricas
CREATE POLICY "Membros podem ver views do quiz"
    ON public.quiz_views FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_views.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

-- 2. Rastreamento de drop-off por pergunta
--    Registra até onde o usuário chegou antes de abandonar
CREATE TABLE IF NOT EXISTS public.quiz_dropoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
    question_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.quiz_dropoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Público pode registrar drop-offs"
    ON public.quiz_dropoffs FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Membros podem ver drop-offs"
    ON public.quiz_dropoffs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_dropoffs.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

-- 3. Lógica Condicional nas Perguntas (Branching)
--    Adiciona coluna branching_rules à tabela questions
--    Formato JSON: [{ "option_id": "uuid", "go_to_order": 3 }]
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS branching_rules JSONB DEFAULT '[]'::jsonb;

-- Índice para performance nas buscas por quiz_id nas views e dropoffs
CREATE INDEX IF NOT EXISTS idx_quiz_views_quiz_id ON public.quiz_views(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_dropoffs_quiz_id ON public.quiz_dropoffs(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_dropoffs_question_id ON public.quiz_dropoffs(question_id);
