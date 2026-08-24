// Builds the full "RAIO-X DA CLÍNICA" funnel document (8-question maturity
// diagnostic + lead capture + 4 score-based result pages + final invite) and
// emits a standalone SQL script that creates it as a brand-new funnel
// (funnels + funnel_pages + funnel_elements + a single draft
// funnel_versions row carrying the matching snapshot). Every V2 write RPC
// requires an authenticated auth.uid(), which a direct admin/service_role
// connection never has — so this inserts into the relational tables
// directly instead, the same pattern already used to seed the 3 system
// templates. Left as a draft on purpose (not published) so the revenue-
// bracket result copy placeholders can be reviewed and filled in first.
// Run with:
//   npx tsx scripts/build-raiox-funnel.ts <workspace-id> <owner-email> > /tmp/raiox-create.sql
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

// Builds a quiz_choice element whose options score by position: first
// option = 0 points, last = (count - 1) points — matches the "posição
// crescente" scoring the user picked, since every question's options are
// already written worst-to-best.
function scoredChoice(
  pageId: string,
  parentId: string,
  order: number,
  fieldKey: string,
  label: string,
  optionLabels: string[],
) {
  const scoring = optionLabels.map((optLabel, index) => ({
    id: uuid(),
    value: optLabel,
    points: index,
  }))
  return el(
    'quiz_choice',
    pageId,
    parentId,
    order,
    { label, fieldKey, required: true, options: optionLabels },
    {},
    { scoring },
  )
}

export function buildRaioXDocument(funnelId: string): FunnelDocument {
  const pages: FunnelPage[] = []
  const elements: FunnelElement[] = []

  // ---------------------------------------------------------------------
  // Page 1 — Abertura
  // ---------------------------------------------------------------------
  const pIntro = page('Abertura', 'abertura', 0)
  pages.push(pIntro)
  const sIntro = section(elements, pIntro.id, 0, { paddingY: 64 })
  elements.push(
    el('heading', pIntro.id, sIntro, 0, { text: 'RAIO-X DA CLÍNICA' }, { fontSize: 20, fontWeight: 700, textColor: '#a78bfa' }),
    el('heading', pIntro.id, sIntro, 1, { text: 'Sua clínica está crescendo ou apenas deixando você mais ocupado?' }),
    el('text', pIntro.id, sIntro, 2, { text: 'Em menos de 3 minutos, descubra o nível de maturidade da sua clínica, quais gargalos podem estar limitando seu crescimento e qual deveria ser o seu próximo movimento.' }),
    el('button', pIntro.id, sIntro, 3, { text: 'COMEÇAR MEU RAIO-X', action: 'next_page' }, { width: '100%' }),
  )

  // ---------------------------------------------------------------------
  // Questions 1-7 — maturity diagnostic (scored)
  // ---------------------------------------------------------------------
  const questions: Array<{ slug: string; name: string; fieldKey: string; label: string; options: string[] }> = [
    {
      slug: 'pergunta-1', name: 'Pergunta 1', fieldKey: 'cenario_atual',
      label: 'Hoje, qual cenário mais representa sua clínica?',
      options: [
        'Tenho dificuldade para manter minha agenda preenchida.',
        'Tenho pacientes, mas meu faturamento ainda oscila muito.',
        'Faturo bem, mas a clínica ainda depende demais de mim.',
        'Tenho uma boa operação, mas sinto que poderia faturar e lucrar muito mais.',
        'Minha clínica está estruturada e quero expandir.',
      ],
    },
    {
      slug: 'pergunta-2', name: 'Pergunta 2', fieldKey: 'origem_pacientes',
      label: 'De onde vêm a maioria dos seus novos pacientes?',
      options: [
        'Indicação.',
        'Instagram/orgânico.',
        'Tráfego pago.',
        'Google e outros canais.',
        'Tenho diferentes canais de aquisição funcionando de forma previsível.',
      ],
    },
    {
      slug: 'pergunta-3', name: 'Pergunta 3', fieldKey: 'atendimento_comercial',
      label: 'Quando um potencial paciente demonstra interesse, o que normalmente acontece?',
      options: [
        'Eu mesma(o) ou minha secretária responde quando consegue.',
        'Temos atendimento, mas muitos perguntam preço e desaparecem.',
        'Conseguimos agendar, mas temos muito no-show.',
        'Temos processo comercial, mas a conversão ainda poderia melhorar.',
        'Acompanhamos lead → agendamento → comparecimento → venda.',
      ],
    },
    {
      slug: 'pergunta-4', name: 'Pergunta 4', fieldKey: 'dependencia_operacional',
      label: 'Se você parasse de atender por 30 dias, o que aconteceria com o faturamento da clínica?',
      options: [
        'Praticamente pararia.',
        'Cairia drasticamente.',
        'Cairia, mas a clínica continuaria operando.',
        'Temos outros profissionais/produtos que sustentariam boa parte da operação.',
        'A clínica funciona sem depender diretamente dos meus atendimentos.',
      ],
    },
    {
      slug: 'pergunta-5', name: 'Pergunta 5', fieldKey: 'controle_financeiro',
      label: 'Quando você olha para os números da clínica, qual dessas situações mais se aproxima da sua realidade?',
      options: [
        'Sei quanto faturo, mas não exatamente quanto sobra.',
        'Tenho noção dos custos e lucro, mas não acompanho indicadores.',
        'Conheço faturamento, custos e margem.',
        'Sei também quais procedimentos realmente deixam mais lucro.',
        'Tenho dashboard e tomo decisões com base nos números.',
      ],
    },
    {
      slug: 'pergunta-6', name: 'Pergunta 6', fieldKey: 'gargalo_principal',
      label: 'Qual desses gargalos mais incomoda você hoje?',
      options: [
        'Atrair pacientes qualificados.',
        'Transformar interessados em pacientes agendados.',
        'Aumentar meu ticket e vender procedimentos de maior valor.',
        'Construir autoridade e deixar de competir por preço.',
        'Organizar equipe, processos e gestão.',
        'Faturar mais sem precisar atender cada vez mais.',
        'Expandir a clínica, criar novos produtos ou novas fontes de receita.',
      ],
    },
    {
      slug: 'pergunta-7', name: 'Pergunta 7', fieldKey: 'proximo_nivel',
      label: 'Qual é o próximo nível que você deseja alcançar nos próximos 12 meses?',
      options: [
        'Ter uma agenda mais previsível.',
        'Aumentar significativamente o faturamento.',
        'Aumentar lucro e organizar a operação.',
        'Construir uma equipe que dependa menos de mim.',
        'Me tornar uma referência no meu mercado.',
        'Expandir para cursos, mentorias, novas unidades ou outros negócios.',
      ],
    },
  ]

  const questionPages: FunnelPage[] = []
  for (const [index, q] of questions.entries()) {
    const p = page(q.name, q.slug, pages.length)
    pages.push(p)
    questionPages.push(p)
    const s = section(elements, p.id, 0, { paddingY: 56 })
    const progress = Math.round(((index + 1) / (questions.length + 1)) * 100)
    elements.push(
      el('progress', p.id, s, 0, { label: 'Progresso', value: progress, showValue: false }),
      scoredChoice(p.id, s, 1, q.fieldKey, q.label, q.options),
    )
  }

  // ---------------------------------------------------------------------
  // Question 8 — revenue bracket (used only to tailor result copy, not
  // scored into the maturity index — captured as its own variable/answer).
  // ---------------------------------------------------------------------
  const pRevenue = page('Pergunta 8', 'pergunta-8', pages.length)
  pages.push(pRevenue)
  const sRevenue = section(elements, pRevenue.id, 0, { paddingY: 56 })
  elements.push(
    el('progress', pRevenue.id, sRevenue, 0, { label: 'Progresso', value: 95, showValue: false }),
    el('quiz_choice', pRevenue.id, sRevenue, 1, {
      label: 'Para finalizar, qual é aproximadamente o faturamento mensal da sua clínica?',
      helpText: 'Essa informação é usada apenas para calibrar seu diagnóstico — os dados são confidenciais.',
      fieldKey: 'faturamento_mensal',
      required: true,
      options: [
        'Até R$30 mil',
        'R$30 mil a R$70 mil',
        'R$70 mil a R$150 mil',
        'R$150 mil a R$300 mil',
        'R$300 mil a R$500 mil',
        'Acima de R$500 mil',
      ],
    }),
  )

  // ---------------------------------------------------------------------
  // Lead capture
  // ---------------------------------------------------------------------
  const pLead = page('Seus dados', 'seus-dados', pages.length)
  pages.push(pLead)
  const sLead = section(elements, pLead.id, 0, { paddingY: 56 })
  elements.push(
    el('heading', pLead.id, sLead, 0, { text: 'Quase lá! Para onde enviamos o seu Raio-X personalizado?' }),
    el('short_text', pLead.id, sLead, 1, { label: 'Nome', fieldKey: 'nome', required: true }),
    el('phone', pLead.id, sLead, 2, { label: 'WhatsApp', fieldKey: 'telefone', required: true }),
    el('short_text', pLead.id, sLead, 3, { label: 'Instagram da clínica (opcional)', placeholder: '@suaclinica', fieldKey: 'instagram', required: false }),
    // IMPORTANT: action must be 'next_page', not 'submit'. handleAction()
    // in funnel-player.tsx only calls resolveFunnelDecision() — which is
    // what evaluates flow.resultRanges and routes to the right result
    // page — on the 'next_page' branch. A 'submit' action calls submit()
    // directly and never consults resultRanges at all, so the visitor
    // would always land on the generic "Tudo certo!" screen instead of
    // one of the 4 score-based result pages. The real submission still
    // happens: resolveFunnelDecision finds no next page after routing
    // through a result page's own 'Continuar' button (action: submit),
    // so the lead is recorded at that point instead.
    el('button', pLead.id, sLead, 4, { text: 'GERAR MEU RAIO-X', action: 'next_page' }, { width: '100%' }),
  )

  // ---------------------------------------------------------------------
  // Result pages — one per maturity stage. Score range: 7 scored questions,
  // max per question = optionCount-1 (4,4,4,4,4,4,6) → max total = 30.
  // Split into 4 equal-ish bands across [0, 30].
  // ---------------------------------------------------------------------
  const resultPages: Array<{ page: FunnelPage; key: string }> = []

  function resultPage(
    slug: string,
    name: string,
    emoji: string,
    title: string,
    lead: string,
    body: string,
    nextStep: string,
    resultKey: string,
  ) {
    const p = page(name, slug, pages.length)
    pages.push(p)
    const s = section(elements, p.id, 0, { paddingY: 64 })
    elements.push(
      el('heading', p.id, s, 0, { text: `${emoji} ${title}` }),
      el('text', p.id, s, 1, { text: lead }, { fontWeight: 700, textColor: '#fafafa' }),
      el('text', p.id, s, 2, { text: body }),
      el('offer', p.id, s, 3, {
        eyebrow: 'Próximo passo',
        title: nextStep,
        text: '[cifra a definir — calibrar percentuais reais de crescimento com o time do Dr. Ritchie antes de publicar, com base na faixa de faturamento informada na pergunta 8]',
      }),
      el('button', p.id, s, 4, { text: 'Continuar', action: 'next_page' }, { width: '100%' }),
    )
    resultPages.push({ page: p, key: resultKey })
  }

  resultPage(
    'resultado-sobrevivencia', 'Resultado: Sobrevivência', '🔴', 'SOBREVIVÊNCIA',
    'Você ainda possui uma clínica muito dependente da sua própria produção.',
    'Agenda, aquisição de pacientes e faturamento provavelmente exigem sua presença constante. Seu próximo nível não é simplesmente atender mais. É construir previsibilidade.',
    'Se você está em Sobrevivência, o movimento mais urgente é sair do improviso na aquisição e no atendimento comercial — antes de pensar em qualquer outra frente.',
    'sobrevivencia',
  )
  resultPage(
    'resultado-tracao', 'Resultado: Tração', '🟠', 'CLÍNICA EM TRAÇÃO',
    'Você já provou que existe demanda pelo seu trabalho.',
    'O problema é que crescimento ainda significa trabalhar mais. Existem oportunidades em comercial, posicionamento, processos e gestão que podem transformar o que hoje depende de esforço em uma operação mais previsível.',
    'Se você está em Tração, o próximo passo natural é transformar sua demanda em processo — para que crescer não signifique mais horas suas na cadeira.',
    'tracao',
  )
  resultPage(
    'resultado-crescimento', 'Resultado: Crescimento', '🟡', 'CLÍNICA EM CRESCIMENTO',
    'Sua clínica já possui demanda e faturamento. Agora o desafio mudou.',
    'Pequenos gargalos em conversão, ticket, equipe, margem ou posicionamento podem estar representando dezenas de milhares de reais deixados na mesa todos os meses. Seu próximo nível exige menos improvisação e mais estratégia.',
    'Se você está em Crescimento, o próximo passo é mapear exatamente onde esse dinheiro está sendo deixado na mesa — geralmente está em 1 ou 2 gargalos específicos, não em tudo ao mesmo tempo.',
    'crescimento',
  )
  resultPage(
    'resultado-expansao', 'Resultado: Expansão', '🟢', 'CLÍNICA EM EXPANSÃO',
    'Você construiu algo que vai além da sua capacidade técnica.',
    'Agora o desafio é transformar autoridade e operação em ativos que cresçam sem depender proporcionalmente das suas horas de atendimento. Novos profissionais, produtos, cursos, mentorias, unidades, eventos ou outras fontes de receita podem fazer parte dessa próxima fase.',
    'Se você está em Expansão, o próximo passo é decidir com clareza qual nova fonte de receita vale ser construída primeiro — e com que estrutura por trás dela.',
    'expansao',
  )

  // ---------------------------------------------------------------------
  // Final invite page — every result page converges here.
  // ---------------------------------------------------------------------
  const pInvite = page('Convite', 'convite', pages.length)
  pages.push(pInvite)
  const sInvite = section(elements, pInvite.id, 0, { paddingY: 56 })
  elements.push(
    el('heading', pInvite.id, sInvite, 0, { text: 'Seu resultado pode ser analisado pelo time do Dr. Ritchie.' }),
    el('text', pInvite.id, sInvite, 1, { text: 'Periodicamente, o Dr. Ritchie e seu time selecionam alguns profissionais de HOF e donos de clínicas para uma Sessão Estratégica de Diagnóstico. Essa sessão não é disponibilizada automaticamente para todos que realizam o Raio-X. Nosso time analisa primeiro o momento da clínica e o potencial de crescimento.' }),
    el('testimonial', pInvite.id, sInvite, 2, {
      quote: 'Este mês, o time abre um número limitado de Sessões Estratégicas. Caso seu perfil seja selecionado, vamos aprofundar seus números e identificar onde sua clínica pode estar perdendo pacientes e dinheiro, qual gargalo está impedindo o próximo nível, quais áreas precisam ser priorizadas e quais movimentos podem gerar maior impacto nos próximos meses.',
      author: 'Equipe Dr. Ritchie',
      role: 'Sessão Estratégica de Diagnóstico',
    }),
    el('quiz_choice', pInvite.id, sInvite, 3, {
      label: 'Você gostaria de submeter sua clínica para análise?',
      fieldKey: 'quer_analise',
      required: true,
      options: ['Sim. Quero que analisem minha clínica.', 'Ainda não.'],
    }),
    el('button', pInvite.id, sInvite, 4, { text: 'SOLICITAR ANÁLISE DA MINHA CLÍNICA', action: 'submit' }, { width: '100%' }),
  )

  // ---------------------------------------------------------------------
  // Flow: linear through intro → 8 questions → lead capture, then
  // score-routed (via resultRanges, evaluated before any default
  // connection) to one of the 4 result pages, each converging on the
  // final invite page. No default connection leaves pLead on purpose —
  // resultRanges must be the only thing resolving that hop.
  // ---------------------------------------------------------------------
  const linearChain = [pIntro, ...questionPages, pRevenue, pLead]
  const connections = linearChain.slice(0, -1).map((current, index) => ({
    id: uuid(),
    sourcePageId: current.id,
    targetPageId: linearChain[index + 1].id,
    isDefault: true,
  }))
  for (const { page: rp } of resultPages) {
    connections.push({ id: uuid(), sourcePageId: rp.id, targetPageId: pInvite.id, isDefault: true })
  }

  // Max score = sum of (optionCount - 1) across the 7 scored questions:
  // six 5-option questions (4 pts max each) + one 7-option question (6 pts
  // max) = 6*4 + 6 = 30. Split into 4 bands of ~7-8 points each.
  const resultRanges = [
    { id: uuid(), label: 'Sobrevivência', sourcePageId: pLead.id, targetPageId: resultPages[0].page.id, minScore: 0, maxScore: 7, resultKey: resultPages[0].key },
    { id: uuid(), label: 'Tração', sourcePageId: pLead.id, targetPageId: resultPages[1].page.id, minScore: 8, maxScore: 15, resultKey: resultPages[1].key },
    { id: uuid(), label: 'Crescimento', sourcePageId: pLead.id, targetPageId: resultPages[2].page.id, minScore: 16, maxScore: 23, resultKey: resultPages[2].key },
    { id: uuid(), label: 'Expansão', sourcePageId: pLead.id, targetPageId: resultPages[3].page.id, minScore: 24, maxScore: 30, resultKey: resultPages[3].key },
  ]

  return document(funnelId, 'RAIO-X DA CLÍNICA', 'raio-x-clinica-completo', pages, elements, {
    entryPageId: pIntro.id,
    connections,
    resultRanges,
  })
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

// Only emit SQL when this file is run directly (`tsx build-raiox-funnel.ts`),
// not when validate-raiox-funnel.ts imports buildRaioXDocument() for
// structural checks.
if (process.argv[1]?.includes('build-raiox-funnel')) {
  const WORKSPACE_ID = process.argv[2]
  const OWNER_EMAIL = process.argv[3]
  if (!WORKSPACE_ID || !OWNER_EMAIL) {
    console.error('Usage: npx tsx scripts/build-raiox-funnel.ts <workspace-id> <owner-email> > create.sql')
    process.exit(1)
  }

  const funnelId = uuid()
  const doc = buildRaioXDocument(funnelId)
  const versionId = uuid()
  const snapshot = JSON.stringify(doc).replace(/'/g, "''")

  // Every V2 write RPC (create_funnel, import_funnel_v2, etc.) requires an
  // authenticated auth.uid() and is therefore unusable from a direct admin/
  // service_role connection. This inserts into the relational tables
  // directly — funnels, funnel_pages, funnel_elements — then a single draft
  // funnel_versions row carrying the exact same content as a snapshot, so
  // get_funnel_draft (which reads the relational tables, not the snapshot)
  // and the builder's "Publicar" (which reads/writes the snapshot) both see
  // consistent content immediately.
  const pagesSql = doc.pages.map((p) => (
    `(${sqlString(p.id)}::uuid, ${sqlString(funnelId)}::uuid, ${sqlString(p.name)}, ${sqlString(p.slug)}, ${p.order}, '{}'::jsonb)`
  )).join(',\n  ')

  const elementsSql = doc.elements.map((e) => {
    const content = JSON.stringify(e.content).replace(/'/g, "''")
    const styles = JSON.stringify(e.styles).replace(/'/g, "''")
    const logic = JSON.stringify(e.logic).replace(/'/g, "''")
    const parentId = e.parentId ? `${sqlString(e.parentId)}::uuid` : 'null'
    return `(${sqlString(e.id)}::uuid, ${sqlString(funnelId)}::uuid, ${sqlString(e.pageId)}::uuid, ${parentId}, ${sqlString(e.slot)}, ${e.order}, ${sqlString(e.type)}, '${content}'::jsonb, '${styles}'::jsonb, '${logic}'::jsonb)`
  }).join(',\n  ')

  console.log(`-- Creates the full "RAIO-X DA CLÍNICA" funnel (8 scored questions,
-- lead capture, 4 score-routed result pages, final invite) as a brand-new
-- funnel — left as a draft, not published, so the revenue-bracket
-- placeholders in the result copy can be reviewed and filled in first.
do $raiox_create$
declare
  v_owner_id uuid;
begin
  select id into v_owner_id from auth.users where email = ${sqlString(OWNER_EMAIL)} limit 1;
  if v_owner_id is null then
    raise exception 'No user found with email %', ${sqlString(OWNER_EMAIL)};
  end if;

  insert into public.funnels (id, workspace_id, name, description, slug, status, created_by)
  values (${sqlString(funnelId)}::uuid, ${sqlString(WORKSPACE_ID)}::uuid, ${sqlString(doc.title)}, null, ${sqlString(doc.slug)}, 'draft', v_owner_id);

  insert into public.funnel_pages (id, funnel_id, name, slug, order_num, settings) values
  ${pagesSql};

  insert into public.funnel_elements (id, funnel_id, page_id, parent_id, slot, order_num, type, content, styles, logic) values
  ${elementsSql};

  insert into public.funnel_versions (id, funnel_id, version_number, revision, kind, label, snapshot, created_by)
  values (${sqlString(versionId)}::uuid, ${sqlString(funnelId)}::uuid, 1, 0, 'draft', 'Versão inicial', '${snapshot}'::jsonb, v_owner_id);

  update public.funnels set latest_draft_version_id = ${sqlString(versionId)}::uuid where id = ${sqlString(funnelId)}::uuid;

  raise notice 'Created funnel % with id %', ${sqlString(doc.title)}, '${funnelId}';
end;
$raiox_create$;
`)
}
