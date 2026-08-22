-- ==============================================================================
-- Migração: Quebra de Analytics por Dispositivo
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Adiciona uma coluna simples de categoria de dispositivo (mobile/tablet/
-- desktop) em quiz_views, populada no client a partir da largura de tela no
-- momento em que a view é registrada (ver trackQuizView em
-- src/app/q/[id]/tracking-actions.ts). Não é uma detecção de user-agent
-- completa — só o suficiente para a quebra "Dispositivos" do Analytics.
ALTER TABLE public.quiz_views
    ADD COLUMN IF NOT EXISTS device TEXT CHECK (device IN ('mobile', 'tablet', 'desktop'));
