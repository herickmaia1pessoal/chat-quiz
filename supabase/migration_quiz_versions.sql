-- ==============================================================================
-- Migração: Histórico de Versões do Quiz
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Cada vez que o quiz é salvo com sucesso no builder, um snapshot completo
-- (mesmo formato usado por exportQuizAsJson) é guardado aqui, permitindo
-- navegar o histórico e restaurar uma versão anterior. Só as últimas 20
-- versões por quiz são mantidas (poda feita em código, não aqui).
CREATE TABLE IF NOT EXISTS public.quiz_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.quiz_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros do workspace podem gerenciar versões" ON public.quiz_versions;
CREATE POLICY "Membros do workspace podem gerenciar versões"
    ON public.quiz_versions FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_versions.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = quiz_versions.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

CREATE INDEX IF NOT EXISTS idx_quiz_versions_quiz_id ON public.quiz_versions(quiz_id, created_at DESC);
