-- ==============================================================================
-- Schema do SaaS de Quiz Interativo e Captura de Leads (MVP - Fase 1)
-- ==============================================================================

-- Extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Tabela de Membros do Workspace (Multi-tenant)
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(workspace_id, user_id)
);

-- 3. Tabela de Quizzes
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    meta_pixel_id TEXT,
    webhook_url TEXT,
    redirect_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    theme JSONB DEFAULT '{"primaryColor": "#6366f1", "backgroundColor": "#09090b", "textColor": "#ffffff"}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Tabela de Perguntas
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'text', 'scale', 'lead_capture')),
    order_num INTEGER NOT NULL DEFAULT 0,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Tabela de Opções de Pergunta (para múltipla escolha)
CREATE TABLE IF NOT EXISTS public.question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    order_num INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Tabela de Sessões de Respostas / Leads
CREATE TABLE IF NOT EXISTS public.leads_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    name TEXT,
    phone TEXT,
    email TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Tabela de Respostas Individuais
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID NOT NULL REFERENCES public.leads_responses(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
    text_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- Row Level Security (RLS) e Políticas
-- ==============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para checar permissão de workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = ws_id
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger automático para adicionar o criador do workspace como membro owner
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_after_workspace_insert ON public.workspaces;
CREATE TRIGGER tr_after_workspace_insert
    AFTER INSERT ON public.workspaces
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_workspace();

-- Políticas de Workspaces
CREATE POLICY "Usuários podem ver seus workspaces"
    ON public.workspaces FOR SELECT
    USING (public.is_workspace_member(id) OR owner_id = auth.uid());

CREATE POLICY "Usuários autenticados podem criar workspaces"
    ON public.workspaces FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners e Admins podem atualizar seus workspaces"
    ON public.workspaces FOR UPDATE
    USING (public.is_workspace_member(id));

CREATE POLICY "Owners podem deletar seus workspaces"
    ON public.workspaces FOR DELETE
    USING (owner_id = auth.uid());

-- Políticas de Workspace Members
CREATE POLICY "Membros podem ver outros membros do workspace"
    ON public.workspace_members FOR SELECT
    USING (public.is_workspace_member(workspace_id));

-- Políticas de Quizzes
CREATE POLICY "Membros do workspace podem gerenciar quizzes"
    ON public.quizzes FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Público pode visualizar quizzes publicados"
    ON public.quizzes FOR SELECT
    USING (status = 'published');

-- Políticas de Perguntas
CREATE POLICY "Membros do workspace podem gerenciar perguntas"
    ON public.questions FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = questions.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

CREATE POLICY "Público pode visualizar perguntas de quizzes publicados"
    ON public.questions FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = questions.quiz_id
        AND q.status = 'published'
    ));

-- Políticas de Opções de Perguntas
CREATE POLICY "Membros do workspace podem gerenciar opções"
    ON public.question_options FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.questions qn
        JOIN public.quizzes qz ON qz.id = qn.quiz_id
        WHERE qn.id = question_options.question_id
        AND public.is_workspace_member(qz.workspace_id)
    ));

CREATE POLICY "Público pode visualizar opções de quizzes publicados"
    ON public.question_options FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.questions qn
        JOIN public.quizzes qz ON qz.id = qn.quiz_id
        WHERE qn.id = question_options.question_id
        AND qz.status = 'published'
    ));

-- Políticas de Leads Responses
CREATE POLICY "Membros do workspace podem ver leads"
    ON public.leads_responses FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quizzes q
        WHERE q.id = leads_responses.quiz_id
        AND public.is_workspace_member(q.workspace_id)
    ));

CREATE POLICY "Qualquer usuário/lead pode criar sua resposta"
    ON public.leads_responses FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Qualquer usuário/lead pode atualizar sua própria sessão de resposta"
    ON public.leads_responses FOR UPDATE
    USING (true);

-- Políticas de Respostas (Answers)
CREATE POLICY "Membros do workspace podem ver respostas"
    ON public.answers FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.leads_responses lr
        JOIN public.quizzes q ON q.id = lr.quiz_id
        WHERE lr.id = answers.response_id
        AND public.is_workspace_member(q.workspace_id)
    ));

CREATE POLICY "Qualquer usuário/lead pode inserir respostas"
    ON public.answers FOR INSERT
    WITH CHECK (true);
