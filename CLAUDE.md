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
- Proteção de rotas via Middleware de Autenticação (`middleware.ts`).

### 2. Construtor de Quizzes (Builder)
- Interface de criação drag/reorder.
- **8 Tipos de Blocos:**
  - `multiple_choice`: Múltipla escolha padrão.
  - `text`: Resposta aberta em texto.
  - `scale`: Escala numérica (NPS 1-10).
  - `lead_capture`: Formulário de bloqueio de tela (Nome, E-mail, Telefone).
  - `image_choice`: Opções com upload de imagem.
  - `likert`: Escala Likert de concordância pré-preenchida (5 opções).
  - `content`: Interstício narrativo (apenas texto/CTAs).
  - `comparison`: Tabela comparativa (Antes x Depois).
- **Lógica Condicional (Branching):** Regras de "SE X ENTÃO vá para Y".
- **Régua de Resultados (Scoring):** Cálculo de pontuação por resposta para exibir resultados personalizados em níveis definidos pelo usuário, com tela de carregamento dinâmica ("Calculando...", "Processando...").
- **Templates Padrão:** Importação de quizzes pré-configurados (Ex: Skincare, Nivelamento de Inglês, Diagnóstico Digital).

### 3. Player Interativo (Mobile-First)
- UI otimizada com glassmorphism, barra de progresso e navegação "Voltar" (com histórico de ramificação).
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
O projeto utiliza um schema robusto com migrações incrementais (arquivos SQL disponíveis na pasta `/supabase`):
- `workspaces` e `workspace_members`: Multi-tenant.
- `quizzes`: Metadados, status (rascunho/publicado), configurações de tracking, white-label, webhooks e mensagens de carregamento.
- `questions` e `question_options`: Estrutura das perguntas, ordem, opções de texto/imagem e pontuação.
- `quiz_result_levels`: Definição das faixas de score (mínimo e máximo).
- `quiz_templates`: Catálogo de templates.
- `quiz_views` e `quiz_dropoffs`: Analytics nativo.
- `leads_responses` e `answers`: Armazenamento de respostas granulares e dados dos leads.

*(Todas as tabelas estão blindadas por políticas RLS. O player utiliza acesso anônimo com leitura garantida apenas para quizzes com `status = 'published'`)*.

## 🚀 Como testar localmente
1. Certifique-se de que o Supabase está configurado (URL e ANON KEY no `.env.local`).
2. Instale dependências: `npm install`
3. Rode o servidor: `npm run dev`
4. Acesse `http://localhost:3000`

## 📦 Deploy
Repositório conectado ao GitHub com Deploy contínuo ativado via Vercel. 
As variáveis de ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` devem ser inseridas no painel de ambiente de produção.
