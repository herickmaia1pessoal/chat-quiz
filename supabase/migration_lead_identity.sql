-- ==============================================================================
-- Migração: Tipo de Identidade do Lead (deduplicação)
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Define qual campo do lead serve como chave de deduplicação dentro de um
-- mesmo quiz — se a mesma pessoa responder de novo (ex: reabriu o link),
-- a sessão existente é atualizada em vez de criar um lead duplicado.
-- 'none' preserva o comportamento atual (cada envio é sempre um novo lead).
ALTER TABLE public.quizzes
    ADD COLUMN IF NOT EXISTS identity_field TEXT NOT NULL DEFAULT 'none'
    CHECK (identity_field IN ('none', 'email', 'phone', 'name'));
