# QuizFlow SaaS - Documentação do Projeto

## 📚 Visão Geral
**QuizFlow** é uma plataforma SaaS multi-tenant para criação de quizzes interativos otimizada para qualificação de leads, captação de first-party data e conversão via tráfego pago. O projeto foi construído do zero até o deploy em produção.

## 🛠️ Stack Tecnológico
- **Frontend/Backend:** Next.js 16 (App Router) + TypeScript + Edge Runtime
- **Estilização:** Tailwind CSS v4 + UI Components (shadcn/ui adaptado, lucide-react)
- **Banco de Dados & Autenticação:** Supabase (PostgreSQL) com Row Level Security (RLS)
- **Deploy:** Vercel

## ✨ Funcionalidades Implementadas

### 1. Sistema Multi-Tenant (Workspaces)
- Usuários podem criar múltiplos Workspaces.
- Separação total de dados via RLS no Supabase (`is_workspace_member`).
- Proteção de rotas via Middleware de Autenticação (`src/proxy.ts` — Next.js 16 renomeou `middleware.js`→`proxy.js`; a função exportada também precisa se chamar `proxy`, não `middleware`).

### 2. Construtor de Quizzes (Builder)
- **Modelo de Etapas com Múltiplos Blocos** (inspirado no construtor da Inlead): uma **etapa** (`quiz_steps`) é uma tela do player e pode conter **vários blocos empilhados** juntos (ex: Alerta + Imagem + Múltipla Escolha na mesma tela). Cada bloco de conteúdo continua sendo uma linha em `questions`, agora ligada à etapa via `questions.step_id`.
- **Layout do builder em 4 colunas** (`src/components/builder/questions-tab.tsx`, exige tela `xl+`):
  1. **Etapas** — coluna fina à esquerda, só número + indicadores (múltiplos blocos, ramificação).
  2. **Paleta de blocos** — os 17 tipos sempre visíveis; clicar insere na etapa selecionada.
  3. **Preview** — cards clicáveis dos blocos da etapa atual (reordenar, remover, selecionar).
  4. **Propriedades** — editor do bloco selecionado, abas Componente/Estilo/Exibição (só "Componente" é funcional; Estilo e Exibição são placeholders "em breve").
- **17 Tipos de Bloco:**
  - `multiple_choice`: Múltipla escolha padrão.
  - `text`: Resposta aberta em texto.
  - `scale`: Escala numérica (1 a 5).
  - `image_choice`: Opções com imagem.
  - `likert`: Escala de concordância pré-preenchida (5 opções).
  - `content`: Interstício narrativo (texto + depoimento opcional + CTA).
  - `comparison`: Tabela comparativa (Antes x Depois).
  - `timer`: Timer de escassez (contagem regressiva reiniciada por visitante).
  - `numeric_calc`: Campo(s) numérico(s) com fórmula fixa (IMC, diferença) — resultado vira variável.
  - `alert`: Banner de aviso/destaque (variantes info/warning/success/danger).
  - `testimonial`: Card de depoimento avulso, repetível na mesma etapa.
  - `social_proof`: Notificação flutuante estilo "Fulano acabou de comprar".
  - `button`: CTA solto (com opção de link externo, sem capturar resposta).
  - `spacer`: Espaçador de pacing puro, auto-avança.
  - `chart`: Gráfico de barras simples (CSS puro, sem lib externa).
  - `quadrant`: Plot cartesiano X/Y para posicionar o usuário num perfil.
  - `audio`: Player de áudio embutido.
  - `lead_capture`: Formulário de bloqueio de tela (Nome, E-mail, Telefone) — etapa final fixa do player, não é um bloco arrastável.
- **Lógica Condicional (Branching):** por ETAPA (não por bloco) — "SE resposta X nesta etapa, IR para etapa Y" (`quiz_steps.branching_rules`).
- **Régua de Resultados (Scoring):** Cálculo de pontuação por resposta (`question_options.score_value`) para exibir resultados personalizados em níveis definidos pelo usuário (`quiz_result_levels`), com tela de carregamento dinâmica ("Calculando...", "Processando...").
- **Templates Padrão:** Importação de quizzes pré-configurados (Ex: Skincare, Nivelamento de Inglês, Diagnóstico Digital).
- **Variáveis de texto:** `{{nome}}`, `{{telefone}}`, `{{email}}`, `{{resposta_N}}` interpolados em qualquer texto de bloco.
- **Duplicar Quiz:** cópia completa (etapas, blocos, opções, branching remapeado, níveis de resultado) a partir do dashboard.

### 3. Player Interativo (Mobile-First)
- UI otimizada com glassmorphism, barra de progresso e navegação "Voltar" (com histórico de ramificação por etapa).
- Todos os blocos de uma etapa renderizam empilhados na mesma tela; qualquer bloco interativo (pergunta respondida, CTA clicado) avança para a próxima etapa.
- Resolução nativa em Edge para máxima velocidade.

### 4. Tracking e Analytics (Foco em Tráfego Pago)
- **Pixel do Meta e GA4:** Injeção de scripts no Player e disparos de eventos (`generate_lead`, `ViewContent`) de forma híbrida (client-side e edge-side).
- **UTMs:** Passagem de parâmetros UTM de ponta a ponta (da URL inicial até o webhook de captura).
- **Funil de Conversão:** Gráfico visual em tempo real comparando Views → Inícios → Leads.
- **Drop-off Analysis:** Mapeamento de onde os usuários abandonam o quiz por pergunta específica.

### 5. Captura de Leads e Webhooks
- Botão/Tela de captura que obriga o usuário a inserir os dados para ver o resultado.
- Disparo de Webhook (POST) com payload JSON completo (dados do lead, respostas, score e UTMs) para integração com n8n, Make, Typebot e Evolution API.
- Tabela interna de leads com visualização e exportação CSV diretamente no painel.

## 🗄️ Estrutura do Banco de Dados (Supabase)
O projeto utiliza um schema robusto com migrações incrementais (arquivos SQL disponíveis na pasta `/supabase`, todas idempotentes — precisam ser rodadas manualmente no SQL Editor):
- `workspaces` e `workspace_members`: Multi-tenant.
- `quizzes`: Metadados, status (rascunho/publicado), configurações de tracking, white-label, webhooks, scoring (`enable_scored_result`) e mensagens de carregamento.
- `quiz_steps`: Etapas — o que o player efetivamente navega entre. Cada etapa pode agrupar vários blocos de conteúdo. Guarda `order_num`, `title` (interno) e `branching_rules` (JSONB: `[{option_id, go_to_order}]`, aponta para a próxima ETAPA).
- `questions` e `question_options`: Blocos de conteúdo dentro de uma etapa (`questions.step_id` → `quiz_steps.id`), tipo, ordem *dentro da etapa*, opções de texto/imagem, pontuação (`score_value`) e `settings` (JSONB genérico, formato específico por tipo de bloco).
- `quiz_result_levels`: Definição das faixas de score (mínimo e máximo) — a "régua" de resultado.
- `quiz_templates`: Catálogo de templates (`structure` JSONB).
- `quiz_views` e `quiz_dropoffs`: Analytics nativo (drop-off ainda referencia `question_id`/posição do bloco, não da etapa).
- `leads_responses` e `answers`: Armazenamento de respostas granulares e dados dos leads (`answers.question_id` referencia o bloco respondido, não a etapa).

*(Todas as tabelas estão blindadas por políticas RLS. O player utiliza acesso anônimo com leitura garantida apenas para quizzes com `status = 'published'`. Atenção: `INSERT ... RETURNING` reavalia as políticas de SELECT — inserts públicos em `leads_responses` geram o `id` no client/server com `crypto.randomUUID()` em vez de usar `.select()`, para não precisar abrir SELECT público na tabela de leads.)*

## 🚀 Como testar localmente
1. Certifique-se de que o Supabase está configurado (URL e ANON KEY no `.env.local`).
2. Instale dependências: `npm install`
3. Rode o servidor: `npm run dev`
4. Acesse `http://localhost:3000`

## 📦 Deploy
Repositório conectado ao GitHub com Deploy contínuo ativado via Vercel. 
As variáveis de ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` devem ser inseridas no painel de ambiente de produção.
