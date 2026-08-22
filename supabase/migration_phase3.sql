-- ==============================================================================
-- Migração: Fase 3 — GA4, White-label e Templates (Idempotente)
-- Execute no SQL Editor do Supabase — pode ser rodado múltiplas vezes sem erro
-- ==============================================================================

-- 1. GA4 Measurement ID, White-label e Domínio Customizado por quiz
ALTER TABLE public.quizzes
    ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT,
    ADD COLUMN IF NOT EXISTS show_branding BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- 2. Tabela de Templates de Quiz
CREATE TABLE IF NOT EXISTS public.quiz_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'geral',
    thumbnail_emoji TEXT DEFAULT '📋',
    structure JSONB NOT NULL DEFAULT '{"questions": []}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.quiz_templates ENABLE ROW LEVEL SECURITY;

-- Política idempotente
DROP POLICY IF EXISTS "Usuários autenticados podem ver templates" ON public.quiz_templates;
CREATE POLICY "Usuários autenticados podem ver templates"
    ON public.quiz_templates FOR SELECT
    USING (auth.uid() IS NOT NULL AND is_active = true);

-- 3. Limpar templates antigos para evitar duplicatas e reinserir
DELETE FROM public.quiz_templates WHERE name IN (
    'Descubra Seu Tipo de Pele',
    'Nivelamento de Inglês',
    'Diagnóstico do Seu Negócio Digital'
);

-- Template 1: Descoberta de Pele
INSERT INTO public.quiz_templates (name, description, category, thumbnail_emoji, structure) VALUES (
    'Descubra Seu Tipo de Pele',
    'Funil de qualificação para produtos de skincare. Ideal para e-commerce e clínicas estéticas.',
    'skincare',
    '🧴',
    '{
        "questions": [
            {
                "title": "Como sua pele costuma ficar ao longo do dia?",
                "description": "Selecione a opção que melhor descreve sua pele.",
                "type": "multiple_choice",
                "order_num": 0,
                "options": [
                    {"text": "Oleosa e com brilho excessivo", "order_num": 0},
                    {"text": "Seca e com sensação de tensão", "order_num": 1},
                    {"text": "Oleosa na zona T, seca nas bochechas", "order_num": 2},
                    {"text": "Irritada e sensível ao toque", "order_num": 3}
                ]
            },
            {
                "title": "Com que frequência você tem cravos ou acne?",
                "description": "Seja honesto(a) para uma recomendação mais precisa.",
                "type": "multiple_choice",
                "order_num": 1,
                "options": [
                    {"text": "Frequentemente (toda semana)", "order_num": 0},
                    {"text": "Às vezes (1-2x por mês)", "order_num": 1},
                    {"text": "Raramente", "order_num": 2},
                    {"text": "Nunca tenho esse problema", "order_num": 3}
                ]
            },
            {
                "title": "Qual é seu maior problema de pele hoje?",
                "type": "multiple_choice",
                "order_num": 2,
                "options": [
                    {"text": "Manchas e uniformidade do tom", "order_num": 0},
                    {"text": "Linhas de expressão e envelhecimento", "order_num": 1},
                    {"text": "Poros dilatados e textura", "order_num": 2},
                    {"text": "Ressecamento e descamação", "order_num": 3}
                ]
            },
            {
                "title": "Qual é a sua faixa etária?",
                "type": "multiple_choice",
                "order_num": 3,
                "options": [
                    {"text": "Até 25 anos", "order_num": 0},
                    {"text": "26 a 35 anos", "order_num": 1},
                    {"text": "36 a 45 anos", "order_num": 2},
                    {"text": "Acima de 45 anos", "order_num": 3}
                ]
            }
        ]
    }'::jsonb
);

-- Template 2: Nivelamento de Inglês
INSERT INTO public.quiz_templates (name, description, category, thumbnail_emoji, structure) VALUES (
    'Nivelamento de Inglês',
    'Avalie o nível do aluno antes da matrícula. Perfeito para escolas de idiomas e infoprodutores.',
    'educacao',
    '🇺🇸',
    '{
        "questions": [
            {
                "title": "Como você se descreve em relação ao inglês?",
                "type": "multiple_choice",
                "order_num": 0,
                "options": [
                    {"text": "Nunca estudei (completo iniciante)", "order_num": 0},
                    {"text": "Estudei no básico, mas esqueci muito", "order_num": 1},
                    {"text": "Consigo me virar em situações simples", "order_num": 2},
                    {"text": "Tenho nível intermediário ou avançado", "order_num": 3}
                ]
            },
            {
                "title": "Qual é seu principal objetivo com o inglês?",
                "type": "multiple_choice",
                "order_num": 1,
                "options": [
                    {"text": "Viagens e turismo", "order_num": 0},
                    {"text": "Mercado de trabalho e promoções", "order_num": 1},
                    {"text": "Estudar no exterior", "order_num": 2},
                    {"text": "Assistir séries e filmes sem legenda", "order_num": 3}
                ]
            },
            {
                "title": "Em quanto tempo você quer atingir seu objetivo?",
                "type": "multiple_choice",
                "order_num": 2,
                "options": [
                    {"text": "O mais rápido possível (urgência)", "order_num": 0},
                    {"text": "Entre 6 meses e 1 ano", "order_num": 1},
                    {"text": "Em alguns anos (sem pressa)", "order_num": 2}
                ]
            },
            {
                "title": "Quanto tempo por semana você consegue dedicar?",
                "type": "scale",
                "order_num": 3
            }
        ]
    }'::jsonb
);

-- Template 3: Diagnóstico de Negócio Digital
INSERT INTO public.quiz_templates (name, description, category, thumbnail_emoji, structure) VALUES (
    'Diagnóstico do Seu Negócio Digital',
    'Funil de qualificação para agências, consultores e mentores de marketing digital.',
    'marketing',
    '🚀',
    '{
        "questions": [
            {
                "title": "Qual é o faturamento mensal atual do seu negócio?",
                "type": "multiple_choice",
                "order_num": 0,
                "options": [
                    {"text": "Ainda não faturei (estou começando)", "order_num": 0},
                    {"text": "Até R$ 5.000/mês", "order_num": 1},
                    {"text": "Entre R$ 5.000 e R$ 30.000/mês", "order_num": 2},
                    {"text": "Acima de R$ 30.000/mês", "order_num": 3}
                ]
            },
            {
                "title": "Qual é o seu maior desafio hoje?",
                "type": "multiple_choice",
                "order_num": 1,
                "options": [
                    {"text": "Gerar leads e clientes consistentemente", "order_num": 0},
                    {"text": "Escalar sem aumentar meu custo operacional", "order_num": 1},
                    {"text": "Montar e gerir uma equipe de tráfego", "order_num": 2},
                    {"text": "Definir minha oferta e posicionamento", "order_num": 3}
                ]
            },
            {
                "title": "Você já investe em tráfego pago?",
                "type": "multiple_choice",
                "order_num": 2,
                "options": [
                    {"text": "Sim, e quero escalar meu investimento", "order_num": 0},
                    {"text": "Sim, mas não estou tendo ROI positivo", "order_num": 1},
                    {"text": "Ainda não, mas quero começar", "order_num": 2},
                    {"text": "Trabalho só com orgânico", "order_num": 3}
                ]
            }
        ]
    }'::jsonb
);
