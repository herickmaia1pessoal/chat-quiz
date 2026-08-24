import type {
  ElementCategory,
  ElementDefinition,
  ElementType,
  InspectorDefinition,
  StyleProperties,
} from './types'

const ROOT_ONLY: ElementType[] = []
const LAYOUT_PARENTS: ElementType[] = ['section', 'container']
const CONTENT_PARENTS: ElementType[] = ['section', 'container']

const textContent = (label = 'Texto'): InspectorDefinition => ({
  id: 'content',
  label: 'Conteúdo',
  fields: [{ key: 'text', label, control: 'textarea', target: 'content' }],
})

const fieldContent: InspectorDefinition = {
  id: 'field',
  label: 'Campo',
  fields: [
    { key: 'label', label: 'Rótulo', control: 'text', target: 'content' },
    { key: 'placeholder', label: 'Placeholder', control: 'text', target: 'content' },
    { key: 'helpText', label: 'Texto de ajuda', control: 'text', target: 'content' },
    { key: 'fieldKey', label: 'Chave da resposta', control: 'text', target: 'content' },
    { key: 'required', label: 'Obrigatório', control: 'toggle', target: 'content' },
  ],
}

const choiceFieldContent: InspectorDefinition = {
  id: 'field',
  label: 'Campo de resposta',
  fields: [
    { key: 'label', label: 'Pergunta', control: 'textarea', target: 'content' },
    { key: 'helpText', label: 'Texto de ajuda', control: 'text', target: 'content' },
    { key: 'fieldKey', label: 'Chave da resposta', control: 'text', target: 'content' },
    { key: 'required', label: 'Obrigatório', control: 'toggle', target: 'content' },
  ],
}

const listContent = (key: string, label: string): InspectorDefinition => ({
  id: key,
  label,
  fields: [{ key, label, control: 'options', target: 'content' }],
})

const actionContent: InspectorDefinition = {
  id: 'action',
  label: 'Ação',
  fields: [
    {
      key: 'action',
      label: 'Ao clicar',
      control: 'select',
      target: 'content',
      options: [
        { label: 'Próxima página', value: 'next_page' },
        { label: 'Página anterior', value: 'previous_page' },
        { label: 'Ir para página', value: 'go_to_page' },
        { label: 'Enviar formulário', value: 'submit' },
        { label: 'Abrir URL', value: 'open_url' },
      ],
    },
  ],
}

function definition(
  type: ElementType,
  category: ElementCategory,
  label: string,
  description: string,
  icon: string,
  defaultContent: Record<string, unknown>,
  defaultStyles: StyleProperties = {},
  allowedParents: ElementType[] = CONTENT_PARENTS,
  inspectorSections: InspectorDefinition[] = [],
  interactive = false,
  implementedInV1 = true,
): ElementDefinition {
  return {
    type,
    category,
    label,
    description,
    icon,
    defaultContent,
    defaultStyles,
    allowedParents,
    inspectorSections,
    interactive,
    implementedInV1,
  }
}

export const ELEMENT_DEFINITIONS: ElementDefinition[] = [
  definition('section', 'layout', 'Seção', 'Uma tela do funil', 'PanelsTopLeft', {}, {
    display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: '640px', paddingX: 32, paddingY: 48,
    minHeight: 180, backgroundColor: '#09090b', borderRadius: 16,
  }, ROOT_ONLY),
  definition('container', 'layout', 'Container', 'Agrupa elementos', 'Columns3', {}, {
    display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: '760px',
    paddingX: 24, paddingY: 24, borderRadius: 14,
  }, LAYOUT_PARENTS),
  definition('spacer', 'layout', 'Espaçamento', 'Respiro vertical', 'BetweenVerticalStart', { height: 40 }, { minHeight: 40 }),
  definition('divider', 'layout', 'Divider', 'Linha separadora', 'Minus', {}, { borderColor: '#3f3f46', borderWidth: 1 }),

  definition('heading', 'content', 'Título', 'Headline de impacto', 'Heading1', { text: 'Seu título de impacto' }, { fontSize: 42, fontWeight: 800, lineHeight: 1.1, textAlign: 'center', textColor: '#fafafa' }, CONTENT_PARENTS, [textContent('Título')]),
  definition('text', 'content', 'Texto', 'Parágrafo de apoio', 'AlignLeft', { text: 'Escreva aqui um texto de apoio curto e direto.' }, { fontSize: 18, lineHeight: 1.6, textAlign: 'center', textColor: '#a1a1aa' }, CONTENT_PARENTS, [textContent()]),
  definition('image', 'content', 'Imagem', 'Foto ou ilustração', 'Image', { src: '', alt: 'Imagem', caption: '' }, { width: '100%', minHeight: 240, borderRadius: 16, objectFit: 'cover' }, CONTENT_PARENTS, [{ id: 'image', label: 'Imagem', fields: [{ key: 'src', label: 'URL da imagem', control: 'url', target: 'content' }, { key: 'alt', label: 'Texto alternativo', control: 'text', target: 'content' }] }]),
  definition('video', 'content', 'Vídeo', 'YouTube, Vimeo ou MP4', 'Video', { src: '', title: 'Vídeo' }, { width: '100%', minHeight: 320, borderRadius: 16 }, CONTENT_PARENTS, [{ id: 'video', label: 'Vídeo', fields: [{ key: 'src', label: 'URL do vídeo', control: 'url', target: 'content' }, { key: 'title', label: 'Título acessível', control: 'text', target: 'content' }] }]),
  definition('button', 'content', 'Botão', 'Ação principal', 'MousePointerClick', { text: 'Continuar', action: 'next_page', target: '' }, { backgroundColor: '#7c3aed', textColor: '#ffffff', paddingX: 24, paddingY: 14, borderRadius: 12, fontWeight: 700, textAlign: 'center' }, CONTENT_PARENTS, [textContent('Rótulo'), actionContent], true),
  definition('icon', 'content', 'Ícone', 'Selo visual', 'Sparkles', { icon: 'sparkles', label: 'Destaque' }, { fontSize: 32, textColor: '#8b5cf6', textAlign: 'center' }, CONTENT_PARENTS, [{
    id: 'icon', label: 'Ícone', fields: [
      { key: 'icon', label: 'Símbolo', control: 'select', target: 'content', options: [
        { label: 'Brilho', value: 'sparkles' },
        { label: 'Confirmação', value: 'check' },
        { label: 'Estrela', value: 'star' },
        { label: 'Escudo', value: 'shield' },
        { label: 'Coração', value: 'heart' },
        { label: 'Raio', value: 'bolt' },
        { label: 'Alvo', value: 'target' },
        { label: 'Foguete', value: 'rocket' },
        { label: 'Ideia', value: 'idea' },
        { label: 'Selo', value: 'badge' },
      ] },
      { key: 'label', label: 'Legenda', control: 'text', target: 'content' },
    ],
  }]),
  definition('embed', 'content', 'Embed', 'Conteúdo externo', 'Code2', { url: '', title: 'Conteúdo incorporado' }, { width: '100%', minHeight: 180, borderRadius: 12 }, CONTENT_PARENTS, [{ id: 'embed', label: 'Embed', fields: [{ key: 'url', label: 'URL', control: 'url', target: 'content' }, { key: 'title', label: 'Título', control: 'text', target: 'content' }] }]),
  definition('audio', 'content', 'Áudio', 'Player de áudio', 'AudioLines', { src: '', title: 'Áudio' }, { width: '100%' }, CONTENT_PARENTS, [{ id: 'audio', label: 'Áudio', fields: [{ key: 'src', label: 'URL do áudio', control: 'url', target: 'content' }, { key: 'title', label: 'Título', control: 'text', target: 'content' }] }]),

  definition('short_text', 'form', 'Texto curto', 'Campo de texto', 'TextCursorInput', { label: 'Seu nome', placeholder: 'Digite aqui', helpText: '', fieldKey: 'nome', required: false }, {}, CONTENT_PARENTS, [fieldContent], true),
  definition('email', 'form', 'E-mail', 'Captura de e-mail', 'Mail', { label: 'E-mail', placeholder: 'voce@empresa.com', helpText: '', fieldKey: 'email', required: true }, {}, CONTENT_PARENTS, [fieldContent], true),
  definition('phone', 'form', 'Telefone', 'WhatsApp / telefone', 'Phone', { label: 'Telefone', placeholder: '(00) 00000-0000', helpText: '', fieldKey: 'telefone', required: true }, {}, CONTENT_PARENTS, [fieldContent], true),
  definition('number', 'form', 'Número', 'Valor numérico', 'Hash', { label: 'Quantidade', placeholder: '0', helpText: '', fieldKey: 'numero', required: false, min: 0, max: 100 }, {}, CONTENT_PARENTS, [fieldContent, {
    id: 'range', label: 'Limites', fields: [
      { key: 'min', label: 'Mínimo', control: 'number', target: 'content' },
      { key: 'max', label: 'Máximo', control: 'number', target: 'content' },
    ],
  }], true),
  definition('date', 'form', 'Data', 'Seletor de data', 'CalendarDays', { label: 'Data', helpText: '', fieldKey: 'data', required: false }, {}, CONTENT_PARENTS, [fieldContent], true),
  definition('select', 'form', 'Select', 'Lista suspensa', 'ListFilter', { label: 'Selecione uma opção', placeholder: 'Escolha...', helpText: '', fieldKey: 'selecao', required: false, options: ['Opção 1', 'Opção 2'] }, {}, CONTENT_PARENTS, [fieldContent, listContent('options', 'Opções')], true),
  definition('checkbox', 'form', 'Checkbox', 'Aceite ou múltipla', 'ListChecks', { label: 'Selecione as opções', helpText: '', fieldKey: 'checkbox', required: false, options: ['Opção 1', 'Opção 2'] }, {}, CONTENT_PARENTS, [fieldContent, listContent('options', 'Opções')], true),
  definition('radio', 'form', 'Radio', 'Escolha única', 'CircleDot', { label: 'Escolha uma opção', helpText: '', fieldKey: 'radio', required: false, options: ['Opção 1', 'Opção 2'] }, {}, CONTENT_PARENTS, [fieldContent, listContent('options', 'Opções')], true),
  definition('upload', 'form', 'Upload', 'Envio de arquivo', 'Upload', { label: 'Envie um arquivo', helpText: 'PDF, PNG ou JPG', fieldKey: 'arquivo', required: false, accept: '.pdf,.png,.jpg,.jpeg' }, {}, CONTENT_PARENTS, [fieldContent, {
    id: 'upload', label: 'Arquivo', fields: [
      { key: 'accept', label: 'Formatos aceitos', control: 'text', target: 'content', placeholder: '.pdf,.png,.jpg' },
    ],
  }], true),

  definition('quiz_choice', 'interactive', 'Quiz / Escolha', 'Cards de resposta', 'LayoutGrid', {
    label: 'Escolha uma resposta', helpText: '', fieldKey: 'escolha', required: true,
    options: ['Resposta A', 'Resposta B'],
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#8b5cf6', fontSize: 16,
  }, CONTENT_PARENTS, [choiceFieldContent, listContent('options', 'Opções')], true),
  definition('slider', 'interactive', 'Slider', 'Escala arrastável', 'SlidersHorizontal', {
    label: 'Escolha um valor', helpText: '', fieldKey: 'escala', required: false,
    min: 0, max: 10, step: 1, showValue: true,
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#8b5cf6', fontSize: 16,
  }, CONTENT_PARENTS, [choiceFieldContent, {
    id: 'range', label: 'Escala', fields: [
      { key: 'min', label: 'Mínimo', control: 'number', target: 'content' },
      { key: 'max', label: 'Máximo', control: 'number', target: 'content' },
      { key: 'step', label: 'Intervalo', control: 'number', target: 'content' },
      { key: 'showValue', label: 'Mostrar valor', control: 'toggle', target: 'content' },
    ],
  }], true),
  definition('rating', 'interactive', 'Rating', 'Avaliação por estrelas', 'Star', {
    label: 'Como você avalia?', helpText: '', fieldKey: 'avaliacao', required: false, max: 5,
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#fbbf24', fontSize: 16,
  }, CONTENT_PARENTS, [choiceFieldContent, {
    id: 'rating', label: 'Avaliação', fields: [
      { key: 'max', label: 'Quantidade de estrelas', control: 'number', target: 'content' },
    ],
  }], true),
  definition('progress', 'interactive', 'Progresso', 'Barra de avanço', 'ChartNoAxesColumnIncreasing', {
    label: 'Seu progresso', value: 40, showValue: true,
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#8b5cf6', borderRadius: 999,
  }, CONTENT_PARENTS, [{
    id: 'progress', label: 'Progresso', fields: [
      { key: 'label', label: 'Rótulo acessível', control: 'text', target: 'content' },
      { key: 'value', label: 'Porcentagem', control: 'number', target: 'content' },
      { key: 'showValue', label: 'Mostrar porcentagem', control: 'toggle', target: 'content' },
    ],
  }]),
  definition('countdown', 'interactive', 'Countdown', 'Urgência com tempo', 'Clock3', {
    label: 'A oferta termina em', minutes: 15, expiredText: 'Tempo encerrado', showLabels: true,
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#8b5cf6', textAlign: 'center',
  }, CONTENT_PARENTS, [{
    id: 'countdown', label: 'Contagem regressiva', fields: [
      { key: 'label', label: 'Título', control: 'text', target: 'content' },
      { key: 'minutes', label: 'Duração em minutos', control: 'number', target: 'content' },
      { key: 'expiredText', label: 'Mensagem ao terminar', control: 'text', target: 'content' },
      { key: 'showLabels', label: 'Mostrar unidades', control: 'toggle', target: 'content' },
    ],
  }], true),
  definition('accordion', 'interactive', 'Accordion', 'Conteúdo expansível', 'ListCollapse', {
    title: '', items: [
      { title: 'Pergunta frequente', text: 'Escreva uma resposta clara e objetiva.' },
      { title: 'O que está incluso?', text: 'Descreva os principais detalhes aqui.' },
    ],
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#8b5cf6', gap: 8,
  }, CONTENT_PARENTS, [{
    id: 'accordion', label: 'Accordion', fields: [
      { key: 'title', label: 'Título da seção', control: 'text', target: 'content' },
      { key: 'items', label: 'Itens', control: 'options', target: 'content' },
    ],
  }], true),

  definition('offer', 'marketing', 'Oferta', 'Bloco de oferta', 'BadgePercent', {
    eyebrow: 'Oferta especial', title: 'Transforme seus resultados',
    text: 'Uma proposta clara, direta e alinhada ao próximo passo do seu cliente.',
  }, {
    width: '100%', paddingX: 28, paddingY: 28, backgroundColor: '#111116', textColor: '#fafafa',
    accentColor: '#8b5cf6', borderColor: '#27272a', borderWidth: 1, borderRadius: 20,
    textAlign: 'center', shadow: 'md',
  }, CONTENT_PARENTS, [{
    id: 'offer', label: 'Oferta', fields: [
      { key: 'eyebrow', label: 'Selo', control: 'text', target: 'content' },
      { key: 'title', label: 'Título', control: 'textarea', target: 'content' },
      { key: 'text', label: 'Descrição', control: 'textarea', target: 'content' },
    ],
  }]),
  definition('price', 'marketing', 'Preço', 'Tabela de preço', 'CreditCard', {
    name: 'Plano Pro', price: 'R$ 97', period: '/mês',
    description: 'Tudo o que você precisa para avançar.',
    features: ['Acesso completo', 'Atualizações inclusas', 'Suporte especializado'],
  }, {
    width: '100%', maxWidth: '520px', paddingX: 28, paddingY: 28,
    backgroundColor: '#111116', textColor: '#fafafa', accentColor: '#8b5cf6',
    borderColor: '#3f3f46', borderWidth: 1, borderRadius: 20, textAlign: 'center', shadow: 'md',
  }, CONTENT_PARENTS, [{
    id: 'price', label: 'Preço', fields: [
      { key: 'name', label: 'Nome do plano', control: 'text', target: 'content' },
      { key: 'price', label: 'Preço exibido', control: 'text', target: 'content' },
      { key: 'period', label: 'Período', control: 'text', target: 'content' },
      { key: 'description', label: 'Descrição', control: 'textarea', target: 'content' },
      { key: 'features', label: 'Itens inclusos', control: 'options', target: 'content' },
    ],
  }]),
  definition('testimonial', 'marketing', 'Depoimento', 'Prova social real', 'Quote', {
    quote: 'Este produto mudou a forma como trabalhamos.', author: 'Nome do cliente',
    role: 'Cargo ou empresa', avatar: '',
  }, {
    width: '100%', paddingX: 28, paddingY: 28, backgroundColor: '#111116',
    textColor: '#fafafa', accentColor: '#8b5cf6', borderColor: '#27272a',
    borderWidth: 1, borderRadius: 20, shadow: 'sm',
  }, CONTENT_PARENTS, [{
    id: 'testimonial', label: 'Depoimento', fields: [
      { key: 'quote', label: 'Depoimento', control: 'textarea', target: 'content' },
      { key: 'author', label: 'Nome', control: 'text', target: 'content' },
      { key: 'role', label: 'Cargo ou empresa', control: 'text', target: 'content' },
      { key: 'avatar', label: 'URL da foto', control: 'url', target: 'content' },
    ],
  }]),
  definition('faq', 'marketing', 'FAQ', 'Perguntas frequentes', 'BadgeHelp', {
    title: 'Perguntas frequentes', items: [
      { title: 'Como funciona?', text: 'Explique aqui como a solução funciona.' },
      { title: 'Para quem é indicado?', text: 'Descreva o perfil ideal de cliente.' },
    ],
  }, {
    width: '100%', textColor: '#fafafa', accentColor: '#8b5cf6', gap: 8,
  }, CONTENT_PARENTS, [{
    id: 'faq', label: 'FAQ', fields: [
      { key: 'title', label: 'Título', control: 'text', target: 'content' },
      { key: 'items', label: 'Perguntas e respostas', control: 'options', target: 'content' },
    ],
  }]),
  definition('benefits', 'marketing', 'Benefícios', 'Lista de ganhos', 'BadgeCheck', {
    title: 'O que você recebe', items: ['Benefício principal', 'Resultado esperado', 'Suporte completo'],
  }, {
    width: '100%', paddingX: 24, paddingY: 24, textColor: '#fafafa',
    accentColor: '#10b981', borderRadius: 18,
  }, CONTENT_PARENTS, [{
    id: 'benefits', label: 'Benefícios', fields: [
      { key: 'title', label: 'Título', control: 'text', target: 'content' },
      { key: 'items', label: 'Benefícios', control: 'options', target: 'content' },
    ],
  }]),
  definition('cta', 'marketing', 'CTA', 'Chamada final', 'Megaphone', {
    title: 'Pronto para começar?', text: 'Dê o próximo passo agora.', buttonText: 'Quero começar',
    action: 'next_page', target: '',
  }, {
    width: '100%', paddingX: 32, paddingY: 32, backgroundColor: '#171122',
    textColor: '#fafafa', accentColor: '#8b5cf6', borderColor: '#6d28d9',
    borderWidth: 1, borderRadius: 22, textAlign: 'center', shadow: 'glow',
  }, CONTENT_PARENTS, [{
    id: 'cta', label: 'Chamada', fields: [
      { key: 'title', label: 'Título', control: 'textarea', target: 'content' },
      { key: 'text', label: 'Descrição', control: 'textarea', target: 'content' },
      { key: 'buttonText', label: 'Texto do botão', control: 'text', target: 'content' },
    ],
  }, actionContent], true),
  definition('social_proof', 'marketing', 'Social proof', 'Números de confiança', 'UsersRound', {
    value: '+2.500', label: 'clientes satisfeitos', supportingText: 'Resultados construídos com clientes reais.',
  }, {
    width: '100%', paddingX: 24, paddingY: 24, textColor: '#fafafa',
    accentColor: '#8b5cf6', textAlign: 'center', borderRadius: 18,
  }, CONTENT_PARENTS, [{
    id: 'social-proof', label: 'Prova social', fields: [
      { key: 'value', label: 'Número ou destaque', control: 'text', target: 'content' },
      { key: 'label', label: 'Legenda', control: 'text', target: 'content' },
      { key: 'supportingText', label: 'Texto de apoio', control: 'text', target: 'content' },
    ],
  }]),
  definition('logo_cloud', 'marketing', 'Logo cloud', 'Marcas parceiras', 'Blocks', {
    title: 'Empresas que confiam', logos: ['Marca A', 'Marca B', 'Marca C'],
  }, {
    width: '100%', paddingX: 24, paddingY: 24, textColor: '#fafafa',
    accentColor: '#8b5cf6', textAlign: 'center', borderRadius: 18,
  }, CONTENT_PARENTS, [{
    id: 'logo-cloud', label: 'Marcas', fields: [
      { key: 'title', label: 'Título', control: 'text', target: 'content' },
      { key: 'logos', label: 'Nomes ou URLs de logos', control: 'options', target: 'content' },
    ],
  }]),
]

export const ELEMENT_REGISTRY = Object.fromEntries(
  ELEMENT_DEFINITIONS.map((item) => [item.type, item]),
) as Record<ElementType, ElementDefinition>

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  layout: 'Layout',
  content: 'Elementos',
  form: 'Formulários',
  interactive: 'Interativos',
  marketing: 'Marketing',
}

export const CATEGORY_ORDER: ElementCategory[] = [
  'layout',
  'content',
  'form',
  'interactive',
  'marketing',
]
