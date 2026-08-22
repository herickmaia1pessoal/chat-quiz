-- ==============================================================================
-- Migração: Novos Tipos de Bloco — Imagem, Interstício, Comparativo, Likert
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- 1. Amplia os tipos de pergunta/bloco permitidos.
--    - image_choice: como multiple_choice, mas cada opção carrega uma imagem
--      (reusa question_options + branching_rules + score_value sem mudança).
--    - likert: como multiple_choice, mas o builder pré-preenche 5 opções fixas
--      de concordância (reusa a mesma estrutura de options).
--    - content: interstício narrativo (texto + depoimento opcional + CTA) —
--      não é uma pergunta, não conta para pontuação nem para "Pergunta X de Y".
--    - comparison: tabela comparativa de duas colunas (estado atual vs. solução).
--    Both `content` and `comparison` store their extra fields in the existing
--    `questions.settings` JSONB column (added in the base schema, unused until
--    now) rather than new dedicated columns — the shape is only ever read/
--    written as a whole object by the builder and player.
ALTER TABLE public.questions
    DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE public.questions
    ADD CONSTRAINT questions_type_check
    CHECK (type IN ('multiple_choice', 'text', 'scale', 'lead_capture', 'image_choice', 'likert', 'content', 'comparison'));

-- 2. Imagem por opção — usada por image_choice (e opcionalmente por
--    multiple_choice comum, sem obrigar todo mundo a ter imagem).
ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS image_url TEXT;
