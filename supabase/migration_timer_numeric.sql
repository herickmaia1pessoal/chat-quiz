-- ==============================================================================
-- Migração: Timer de Escassez e Campo Numérico com Cálculo
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Amplia os tipos de bloco permitidos com mais dois:
--   - timer: contagem regressiva de urgência (texto + duração + CTA)
--   - numeric_calc: um ou dois campos numéricos alimentando uma fórmula fixa
--     (ex: IMC = peso / altura²), com o resultado disponível como variável
--     {{resultado_calculo}} em telas posteriores.
-- Ambos guardam seus campos extras em questions.settings, seguindo o mesmo
-- padrão já usado por content/comparison.
ALTER TABLE public.questions
    DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE public.questions
    ADD CONSTRAINT questions_type_check
    CHECK (type IN ('multiple_choice', 'text', 'scale', 'lead_capture', 'image_choice', 'likert', 'content', 'comparison', 'timer', 'numeric_calc'));
