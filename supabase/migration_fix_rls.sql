-- ==============================================================================
-- Corrigir RLS: Políticas públicas para o Player do Quiz
-- Execute no SQL Editor do Supabase
-- ==============================================================================

-- Garantir que qualquer usuário (inclusive anônimo) possa ver quizzes publicados
DROP POLICY IF EXISTS "Público pode visualizar quizzes publicados" ON public.quizzes;
CREATE POLICY "Público pode visualizar quizzes publicados"
    ON public.quizzes FOR SELECT
    USING (status = 'published');

-- Garantir que qualquer usuário possa ver perguntas de quizzes publicados
DROP POLICY IF EXISTS "Público pode visualizar perguntas de quizzes publicados" ON public.questions;
CREATE POLICY "Público pode visualizar perguntas de quizzes publicados"
    ON public.questions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.quizzes q
            WHERE q.id = questions.quiz_id
            AND q.status = 'published'
        )
    );

-- Garantir que qualquer usuário possa ver as opções de perguntas de quizzes publicados
DROP POLICY IF EXISTS "Público pode visualizar opções de quizzes publicados" ON public.question_options;
CREATE POLICY "Público pode visualizar opções de quizzes publicados"
    ON public.question_options FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.questions qn
            JOIN public.quizzes qz ON qz.id = qn.quiz_id
            WHERE qn.id = question_options.question_id
            AND qz.status = 'published'
        )
    );

-- Garantir que qualquer pessoa pode submeter uma resposta (lead capture)
DROP POLICY IF EXISTS "Qualquer usuário/lead pode criar sua resposta" ON public.leads_responses;
CREATE POLICY "Qualquer usuário/lead pode criar sua resposta"
    ON public.leads_responses FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Qualquer usuário/lead pode atualizar sua própria sessão de resposta" ON public.leads_responses;
CREATE POLICY "Qualquer usuário/lead pode atualizar sua própria sessão de resposta"
    ON public.leads_responses FOR UPDATE
    USING (true);

-- Garantir que qualquer pessoa pode registrar uma view
DROP POLICY IF EXISTS "Público pode registrar views" ON public.quiz_views;
CREATE POLICY "Público pode registrar views"
    ON public.quiz_views FOR INSERT
    WITH CHECK (true);

-- Garantir que qualquer pessoa pode registrar drop-off
DROP POLICY IF EXISTS "Público pode registrar drop-offs" ON public.quiz_dropoffs;
CREATE POLICY "Público pode registrar drop-offs"
    ON public.quiz_dropoffs FOR INSERT
    WITH CHECK (true);

-- Garantir que qualquer pessoa pode inserir respostas individuais
DROP POLICY IF EXISTS "Qualquer pessoa pode inserir respostas" ON public.answers;
CREATE POLICY "Qualquer pessoa pode inserir respostas"
    ON public.answers FOR INSERT
    WITH CHECK (true);
