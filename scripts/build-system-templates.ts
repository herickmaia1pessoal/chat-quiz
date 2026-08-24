// Builds the 3 curated system-template FunnelDocuments and emits SQL INSERT
// statements for funnel_templates (workspace_id NULL). The checked-in seed
// (supabase/seed_system_funnel_templates.sql) was generated from this file —
// regenerate it after changing a template, then validate before copying the
// output over (validate-system-templates.ts checks structural invariants
// the DB's publish triggers enforce). Run with:
//   npx tsx scripts/build-system-templates.ts > /tmp/seed.sql
//   npx tsx scripts/validate-system-templates.ts
import { randomUUID } from 'node:crypto'
import type {
  FunnelDocument,
  FunnelElement,
  FunnelPage,
  ElementType,
  ElementLogic,
} from '../src/lib/funnel/types'
import { ELEMENT_REGISTRY } from '../src/lib/funnel/registry'

function uuid() { return randomUUID() }

function el(
  type: ElementType,
  pageId: string,
  parentId: string | null,
  order: number,
  contentOverride: Record<string, unknown> = {},
  stylesOverride: Record<string, unknown> = {},
  logic: ElementLogic = {},
  slot = 'default',
): FunnelElement {
  const def = ELEMENT_REGISTRY[type]
  return {
    id: uuid(),
    type,
    pageId,
    parentId,
    slot,
    order,
    content: { ...def.defaultContent, ...contentOverride },
    styles: { desktop: { ...def.defaultStyles, ...stylesOverride } },
    logic,
  }
}

function page(name: string, slug: string, order: number): FunnelPage {
  return { id: uuid(), name, slug, order, settings: {} }
}

// Creates a root `section` element for the page and pushes it onto
// `elements`, returning its id so callers use *that* as every child's
// parentId — makes it impossible to generate a parentId that doesn't match
// any element in the document.
function section(elements: FunnelElement[], pageId: string, order: number, stylesOverride: Record<string, unknown> = {}): string {
  const node = el('section', pageId, null, order, {}, stylesOverride)
  elements.push(node)
  return node.id
}

function document(funnelId: string, title: string, slug: string, pages: FunnelPage[], elements: FunnelElement[], flow: FunnelDocument['flow']): FunnelDocument {
  return {
    schemaVersion: 2,
    funnelId,
    title,
    slug,
    settings: { theme: 'dark' },
    pages,
    elements,
    variables: [],
    flow,
  }
}

// ---------------------------------------------------------------------------
// Template 1: Captura de leads (Conversão)
// ---------------------------------------------------------------------------
function buildLeadCapture(): FunnelDocument {
  // A single page: the player already shows a native "Tudo certo!"
  // confirmation screen immediately after a successful submit, so a
  // separate "thank you" page would be unreachable in practice — and would
  // fail the publish-time rule requiring every page to reach a submit
  // control, since it has no action of its own.
  const funnelId = uuid()
  const p1 = page('Captura', 'captura', 0)
  const elements: FunnelElement[] = []

  const s1 = section(elements, p1.id, 0, { paddingY: 64 })
  elements.push(
    el('icon', p1.id, s1, 0, { icon: 'sparkles', label: 'Novidade' }),
    el('heading', p1.id, s1, 1, { text: 'Receba o material completo no seu e-mail' }),
    el('text', p1.id, s1, 2, { text: 'Preencha os campos abaixo e garanta acesso imediato, sem custo.' }),
    el('benefits', p1.id, s1, 3, { title: 'O que você recebe', items: ['Guia prático em PDF', 'Checklist de aplicação imediata', 'Acesso a atualizações futuras'] }),
    el('short_text', p1.id, s1, 4, { label: 'Seu nome', placeholder: 'Digite seu nome completo', fieldKey: 'nome', required: true }),
    el('email', p1.id, s1, 5, { fieldKey: 'email', required: true }),
    el('phone', p1.id, s1, 6, { fieldKey: 'telefone', required: false }),
    el('button', p1.id, s1, 7, { text: 'Quero receber agora', action: 'submit' }, { width: '100%' }),
    el('text', p1.id, s1, 8, { text: 'Seus dados estão seguros e não serão compartilhados.' }, { fontSize: 12, textColor: '#71717a' }),
  )

  return document(funnelId, 'Captura de leads', 'captura-de-leads', [p1], elements, {
    entryPageId: p1.id,
    connections: [],
  })
}

// ---------------------------------------------------------------------------
// Template 2: Diagnóstico interativo (Qualificação) — scoring + result ranges
// ---------------------------------------------------------------------------
function buildDiagnostic(): FunnelDocument {
  const funnelId = uuid()
  const p1 = page('Introdução', 'introducao', 0)
  const p2 = page('Pergunta 1', 'pergunta-1', 1)
  const p3 = page('Pergunta 2', 'pergunta-2', 2)
  const p4 = page('Pergunta 3', 'pergunta-3', 3)
  const p5 = page('Seus dados', 'seus-dados', 4)
  const rLow = page('Resultado: começando agora', 'resultado-iniciante', 5)
  const rMid = page('Resultado: no caminho certo', 'resultado-intermediario', 6)
  const rHigh = page('Resultado: avançado', 'resultado-avancado', 7)

  const elements: FunnelElement[] = []

  // Intro
  const sIntro = section(elements, p1.id, 0, { paddingY: 64 })
  elements.push(
    el('icon', p1.id, sIntro, 0, { icon: 'target', label: 'Diagnóstico' }),
    el('heading', p1.id, sIntro, 1, { text: 'Descubra seu nível em 3 perguntas rápidas' }),
    el('text', p1.id, sIntro, 2, { text: 'Leva menos de um minuto e no final você recebe uma recomendação personalizada.' }),
    el('button', p1.id, sIntro, 3, { text: 'Começar diagnóstico', action: 'next_page' }, { width: '100%' }),
  )

  // Q1
  const q1Key = 'pergunta_1'
  const sQ1 = section(elements, p2.id, 0, { paddingY: 56 })
  elements.push(
    el('progress', p2.id, sQ1, 0, { label: 'Progresso', value: 25, showValue: false }),
    el('quiz_choice', p2.id, sQ1, 1, {
      label: 'Com que frequência você revisa seus resultados?',
      fieldKey: q1Key,
      options: ['Quase nunca', 'Às vezes', 'Toda semana'],
    }, {}, {
      scoring: [
        { id: uuid(), value: 'Quase nunca', points: 0 },
        { id: uuid(), value: 'Às vezes', points: 5 },
        { id: uuid(), value: 'Toda semana', points: 10 },
      ],
    }),
  )

  // Q2
  const q2Key = 'pergunta_2'
  const sQ2 = section(elements, p3.id, 0, { paddingY: 56 })
  elements.push(
    el('progress', p3.id, sQ2, 0, { label: 'Progresso', value: 55, showValue: false }),
    el('quiz_choice', p3.id, sQ2, 1, {
      label: 'Você já usa algum processo estruturado hoje?',
      fieldKey: q2Key,
      options: ['Não uso nada', 'Uso algo informal', 'Sim, processo definido'],
    }, {}, {
      scoring: [
        { id: uuid(), value: 'Não uso nada', points: 0 },
        { id: uuid(), value: 'Uso algo informal', points: 5 },
        { id: uuid(), value: 'Sim, processo definido', points: 10 },
      ],
    }),
  )

  // Q3
  const q3Key = 'pergunta_3'
  const sQ3 = section(elements, p4.id, 0, { paddingY: 56 })
  elements.push(
    el('progress', p4.id, sQ3, 0, { label: 'Progresso', value: 85, showValue: false }),
    el('quiz_choice', p4.id, sQ3, 1, {
      label: 'Qual seu principal objetivo agora?',
      fieldKey: q3Key,
      options: ['Organizar o básico', 'Melhorar resultados', 'Escalar o que já funciona'],
    }, {}, {
      scoring: [
        { id: uuid(), value: 'Organizar o básico', points: 0 },
        { id: uuid(), value: 'Melhorar resultados', points: 5 },
        { id: uuid(), value: 'Escalar o que já funciona', points: 10 },
      ],
    }),
  )

  // Lead capture before revealing result. IMPORTANT: action must be
  // 'next_page', not 'submit' — handleAction() in funnel-player.tsx only
  // calls resolveFunnelDecision() (which evaluates flow.resultRanges) on
  // the 'next_page' branch; 'submit' calls submit() directly and never
  // consults resultRanges, so the visitor would always land on the
  // generic "Tudo certo!" screen instead of a score-based result page.
  const sLead = section(elements, p5.id, 0, { paddingY: 56 })
  elements.push(
    el('heading', p5.id, sLead, 0, { text: 'Para onde enviamos seu resultado?' }),
    el('short_text', p5.id, sLead, 1, { label: 'Seu nome', fieldKey: 'nome', required: true }),
    el('email', p5.id, sLead, 2, { fieldKey: 'email', required: true }),
    el('button', p5.id, sLead, 3, { text: 'Ver meu resultado', action: 'next_page' }, { width: '100%' }),
  )

  // Result pages
  const sLow = section(elements, rLow.id, 0, { paddingY: 64 })
  // Result pages are genuine dead ends (no further questions), but every
  // reachable page must still carry an actionable completion control
  // (mirrors the publish-time trigger in
  // 20260823003506_funnel_runtime_security_hardening.sql) — and product-wise
  // it doubles as the natural "talk to us" close for a diagnostic.
  elements.push(
    el('icon', rLow.id, sLow, 0, { icon: 'idea', label: 'Resultado' }),
    el('heading', rLow.id, sLow, 1, { text: 'Você está começando agora — e tudo bem!' }),
    el('text', rLow.id, sLow, 2, { text: 'Foque em construir uma rotina simples antes de pensar em otimizações avançadas.' }),
    el('offer', rLow.id, sLow, 3, { eyebrow: 'Próximo passo', title: 'Comece pelo básico', text: 'Um guia de primeiros passos pode acelerar bastante essa fase inicial.' }),
    el('button', rLow.id, sLow, 4, { text: 'Concluir', action: 'submit' }, { width: '100%' }),
  )

  const sMid = section(elements, rMid.id, 0, { paddingY: 64 })
  elements.push(
    el('icon', rMid.id, sMid, 0, { icon: 'bolt', label: 'Resultado' }),
    el('heading', rMid.id, sMid, 1, { text: 'Você está no caminho certo' }),
    el('text', rMid.id, sMid, 2, { text: 'Já existe alguma estrutura — o próximo passo é torná-la mais consistente.' }),
    el('offer', rMid.id, sMid, 3, { eyebrow: 'Próximo passo', title: 'Refine seu processo', text: 'Pequenos ajustes agora tendem a gerar ganhos rápidos de resultado.' }),
    el('button', rMid.id, sMid, 4, { text: 'Concluir', action: 'submit' }, { width: '100%' }),
  )

  const sHigh = section(elements, rHigh.id, 0, { paddingY: 64 })
  elements.push(
    el('icon', rHigh.id, sHigh, 0, { icon: 'rocket', label: 'Resultado' }),
    el('heading', rHigh.id, sHigh, 1, { text: 'Nível avançado!' }),
    el('text', rHigh.id, sHigh, 2, { text: 'Você já tem uma base sólida. Hora de escalar o que está funcionando.' }),
    el('offer', rHigh.id, sHigh, 3, { eyebrow: 'Próximo passo', title: 'Escale com confiança', text: 'Vamos conversar sobre como ampliar o que já está dando certo.' }),
    el('button', rHigh.id, sHigh, 4, { text: 'Concluir', action: 'submit' }, { width: '100%' }),
  )

  return document(funnelId, 'Diagnóstico interativo', 'diagnostico-interativo', [p1, p2, p3, p4, p5, rLow, rMid, rHigh], elements, {
    entryPageId: p1.id,
    connections: [
      { id: uuid(), sourcePageId: p1.id, targetPageId: p2.id, isDefault: true },
      { id: uuid(), sourcePageId: p2.id, targetPageId: p3.id, isDefault: true },
      { id: uuid(), sourcePageId: p3.id, targetPageId: p4.id, isDefault: true },
      { id: uuid(), sourcePageId: p4.id, targetPageId: p5.id, isDefault: true },
    ],
    resultRanges: [
      { id: uuid(), label: 'Iniciante', sourcePageId: p5.id, targetPageId: rLow.id, minScore: 0, maxScore: 9, resultKey: 'iniciante' },
      { id: uuid(), label: 'Intermediário', sourcePageId: p5.id, targetPageId: rMid.id, minScore: 10, maxScore: 19, resultKey: 'intermediario' },
      { id: uuid(), label: 'Avançado', sourcePageId: p5.id, targetPageId: rHigh.id, minScore: 20, maxScore: 30, resultKey: 'avancado' },
    ],
  })
}

// ---------------------------------------------------------------------------
// Template 3: Aplicação premium (Seleção) — filter question + application form
// ---------------------------------------------------------------------------
function buildPremiumApplication(): FunnelDocument {
  const funnelId = uuid()
  const p1 = page('Apresentação', 'apresentacao', 0)
  const p2 = page('Elegibilidade', 'elegibilidade', 1)
  const p3 = page('Sobre você', 'sobre-voce', 2)
  const p4 = page('Contato', 'contato', 3)
  const pOut = page('Ainda não é o momento', 'nao-elegivel', 4)

  const elements: FunnelElement[] = []

  const sIntro = section(elements, p1.id, 0, { paddingY: 64 })
  elements.push(
    el('icon', p1.id, sIntro, 0, { icon: 'shield', label: 'Seleção' }),
    el('heading', p1.id, sIntro, 1, { text: 'Candidate-se ao programa premium' }),
    el('text', p1.id, sIntro, 2, { text: 'Vagas limitadas e seleção por perfil. O processo leva cerca de 2 minutos.' }),
    el('social_proof', p1.id, sIntro, 3, { value: '+120', label: 'aplicações aprovadas', supportingText: 'Processo seletivo criterioso e transparente.' }),
    el('button', p1.id, sIntro, 4, { text: 'Iniciar candidatura', action: 'next_page' }, { width: '100%' }),
  )

  const filterKey = 'disponibilidade'
  const sFilter = section(elements, p2.id, 0, { paddingY: 56 })
  elements.push(
    el('quiz_choice', p2.id, sFilter, 0, {
      label: 'Você tem disponibilidade para iniciar nos próximos 30 dias?',
      fieldKey: filterKey,
      options: ['Sim, disponível', 'Não, apenas futuramente'],
    }),
  )

  const sAbout = section(elements, p3.id, 0, { paddingY: 56 })
  elements.push(
    el('heading', p3.id, sAbout, 0, { text: 'Conte um pouco sobre você' }),
    el('short_text', p3.id, sAbout, 1, { label: 'Nome completo', fieldKey: 'nome', required: true }),
    el('short_text', p3.id, sAbout, 2, { label: 'Experiência relevante', placeholder: 'Resuma em poucas linhas', fieldKey: 'experiencia', required: true }),
    el('select', p3.id, sAbout, 3, { label: 'Área de atuação', fieldKey: 'area', options: ['Marketing', 'Vendas', 'Produto', 'Operações', 'Outra'], required: true }),
    el('button', p3.id, sAbout, 4, { text: 'Continuar', action: 'next_page' }, { width: '100%' }),
  )

  const sContact = section(elements, p4.id, 0, { paddingY: 56 })
  elements.push(
    el('heading', p4.id, sContact, 0, { text: 'Como podemos falar com você?' }),
    el('email', p4.id, sContact, 1, { fieldKey: 'email', required: true }),
    el('phone', p4.id, sContact, 2, { fieldKey: 'telefone', required: true }),
    el('testimonial', p4.id, sContact, 3, { quote: 'O processo foi rápido e muito bem estruturado.', author: 'Participante anterior', role: 'Turma aprovada' }),
    el('button', p4.id, sContact, 4, { text: 'Enviar candidatura', action: 'submit' }, { width: '100%' }),
  )

  // Disqualification dead end. A page with no outgoing edge is always an
  // implicit completion point at runtime regardless of whether its button
  // says action:'submit' or action:'next_page' — resolveFunnelDecision()
  // finds no target and calls submit() either way. That's the right
  // behavior here too: the partial answers this visitor gave (e.g. "not
  // available") are still a real, useful submission worth capturing.
  const sOut = section(elements, pOut.id, 0, { paddingY: 64 })
  elements.push(
    el('icon', pOut.id, sOut, 0, { icon: 'heart', label: 'Obrigado pelo interesse' }),
    el('heading', pOut.id, sOut, 1, { text: 'Ainda não é o momento ideal' }),
    el('text', pOut.id, sOut, 2, { text: 'Guarde esse link — assim que houver disponibilidade compatível, você pode se candidatar novamente.' }),
    el('button', pOut.id, sOut, 3, { text: 'Entendi', action: 'next_page' }, { width: '100%' }),
  )

  // Once flow.connections is explicitly set (needed for the conditional
  // p2 branch below), the runtime stops synthesizing linear fallbacks for
  // any page — see getEffectiveFlowConnections() / hasExplicitFlow() in
  // src/lib/funnel/flow.ts. Every hop, including the plain "next page"
  // ones, must be declared here or a next_page click would find no
  // connection and prematurely end the run instead of advancing.
  return document(funnelId, 'Aplicação premium', 'aplicacao-premium', [p1, p2, p3, p4, pOut], elements, {
    entryPageId: p1.id,
    connections: [
      { id: uuid(), sourcePageId: p1.id, targetPageId: p2.id, isDefault: true },
      {
        id: uuid(), sourcePageId: p2.id, targetPageId: p3.id, priority: 0,
        condition: { operator: 'and', conditions: [{ id: uuid(), source: 'answer', key: filterKey, operator: 'equals', value: 'Sim, disponível' }] },
      },
      { id: uuid(), sourcePageId: p2.id, targetPageId: pOut.id, isDefault: true },
      { id: uuid(), sourcePageId: p3.id, targetPageId: p4.id, isDefault: true },
    ],
  })
}

export function buildTemplates() {
  return [
    { doc: buildLeadCapture(), category: 'Conversão', description: 'Landing page curta com benefícios, formulário e chamada final.' },
    { doc: buildDiagnostic(), category: 'Qualificação', description: 'Perguntas, pontuação e uma recomendação personalizada ao final.' },
    { doc: buildPremiumApplication(), category: 'Seleção', description: 'Fluxo de candidatura com filtro de elegibilidade, contexto e coleta de dados.' },
  ]
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

// funnel_templates.created_by is a real, required FK to auth.users (no
// "system" pseudo-account exists in this schema). System templates are
// attributed to the platform account that seeded them, identified by email
// so the statement stays correct regardless of its literal user id.
const OWNER_EMAIL = 'workidigitaloficial@gmail.com'

// Only emit SQL when this file is run directly (`tsx build-system-templates.ts`),
// not when validate-templates.ts imports buildTemplates() for structural checks.
if (process.argv[1]?.includes('build-system-templates')) {
  const templates = buildTemplates()
  const statements = templates.map(({ doc, category, description }) => {
    const snapshot = JSON.stringify(doc).replace(/'/g, "''")
    return `insert into public.funnel_templates (id, workspace_id, source_funnel_id, source_version_id, name, description, category, snapshot, created_by, created_at, updated_at)
select gen_random_uuid(), null, null, null, ${sqlString(doc.title)}, ${sqlString(description)}, ${sqlString(category)}, '${snapshot}'::jsonb, id, now(), now()
from auth.users where email = ${sqlString(OWNER_EMAIL)} limit 1;`
  })
  console.log(statements.join('\n\n'))
}
