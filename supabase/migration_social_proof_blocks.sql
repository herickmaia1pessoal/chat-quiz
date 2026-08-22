-- ==============================================================================
-- Migração: Blocos de Prova Social, Composição e Dados
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- Amplia os tipos de bloco permitidos com mais oito, inspirados no catálogo
-- de blocos do Inlead. Todos guardam seus campos extras em questions.settings,
-- seguindo o mesmo padrão já usado por content/comparison/timer:
--   - alert:        banner de aviso/destaque (variante info/warning/success)
--   - testimonial:  card de depoimento avulso (pode repetir vários na mesma etapa)
--   - social_proof: notificação flutuante estilo "Fulano acabou de comprar"
--   - button:       CTA solto no meio do fluxo, sem capturar resposta
--   - spacer:       espaçador de layout puro (não renderiza nada visível)
--   - chart:        gráfico de barras simples (ex: "68% das pessoas como você...")
--   - quadrant:      plot cartesiano de eixo X/Y para posicionar o usuário num perfil
--   - audio:        player de áudio embutido na etapa
-- Nenhum desses produz resposta armazenada em `answers` — são narrativos,
-- como content/comparison/timer, exceto quando explicitamente ligados a uma
-- pergunta anterior (chart/quadrant podem usar {{resposta_N}} nos textos).
ALTER TABLE public.questions
    DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE public.questions
    ADD CONSTRAINT questions_type_check
    CHECK (type IN (
        'multiple_choice', 'text', 'scale', 'lead_capture', 'image_choice',
        'likert', 'content', 'comparison', 'timer', 'numeric_calc',
        'alert', 'testimonial', 'social_proof', 'button', 'spacer', 'chart', 'quadrant', 'audio'
    ));
