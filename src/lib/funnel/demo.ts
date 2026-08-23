import { ELEMENT_REGISTRY } from './registry'
import { FUNNEL_SCHEMA_VERSION, type ElementType, type FunnelDocument, type FunnelElement } from './types'

function demoElement(
  id: string,
  type: ElementType,
  pageId: string,
  parentId: string | null,
  order: number,
  content?: Record<string, unknown>,
  styles?: Record<string, unknown>,
): FunnelElement {
  const definition = ELEMENT_REGISTRY[type]
  return {
    id,
    type,
    pageId,
    parentId,
    slot: 'default',
    order,
    content: { ...structuredClone(definition.defaultContent), ...content },
    styles: { desktop: { ...definition.defaultStyles, ...styles } },
    logic: {},
  }
}

export function createDemoFunnel(funnelId: string): FunnelDocument {
  const pageId = '10000000-0000-4000-8000-000000000001'
  const sectionId = '10000000-0000-4000-8000-000000000002'
  const containerId = '10000000-0000-4000-8000-000000000003'
  const formContainerId = '10000000-0000-4000-8000-000000000007'

  return {
    schemaVersion: FUNNEL_SCHEMA_VERSION,
    funnelId,
    title: 'Raio-X da Clínica',
    slug: `funil-${funnelId.slice(0, 8)}`,
    settings: { theme: 'dark', backgroundColor: '#050507', fontFamily: 'Manrope' },
    pages: [
      { id: pageId, name: 'Boas-vindas', slug: 'boas-vindas', order: 0, settings: {} },
      { id: '10000000-0000-4000-8000-000000000010', name: 'Diagnóstico', slug: 'diagnostico', order: 1, settings: {} },
      { id: '10000000-0000-4000-8000-000000000011', name: 'Resultado', slug: 'resultado', order: 2, settings: {} },
    ],
    elements: [
      demoElement(sectionId, 'section', pageId, null, 0, {}, { minHeight: 720, paddingY: 64 }),
      demoElement(containerId, 'container', pageId, sectionId, 0, {}, { maxWidth: '820px', alignItems: 'center' }),
      demoElement('10000000-0000-4000-8000-000000000004', 'heading', pageId, containerId, 0, { text: 'Sua clínica está crescendo ou apenas deixando você mais ocupado?' }, { fontSize: 46 }),
      demoElement('10000000-0000-4000-8000-000000000005', 'text', pageId, containerId, 1, { text: 'Em menos de 3 minutos, descubra o nível de maturidade da sua clínica, os gargalos que limitam seu crescimento e o próximo movimento.' }),
      demoElement('10000000-0000-4000-8000-000000000006', 'button', pageId, containerId, 2, { text: 'COMEÇAR MEU RAIO-X', action: 'next_page' }),
      demoElement(formContainerId, 'container', pageId, sectionId, 1, {}, { maxWidth: '620px', backgroundColor: '#111116', borderColor: '#27272a', borderWidth: 1 }),
      demoElement('10000000-0000-4000-8000-000000000008', 'short_text', pageId, formContainerId, 0, { label: 'Como podemos chamar você?', placeholder: 'Seu nome', fieldKey: 'nome' }),
      demoElement('10000000-0000-4000-8000-000000000009', 'email', pageId, formContainerId, 1, { label: 'Qual é o seu melhor e-mail?', fieldKey: 'email' }),
    ],
    variables: [
      { id: '20000000-0000-4000-8000-000000000001', key: 'lead.first_name', label: 'Primeiro nome', kind: 'lead', value: null },
      { id: '20000000-0000-4000-8000-000000000002', key: 'lead.email', label: 'E-mail', kind: 'lead', value: null },
      { id: '20000000-0000-4000-8000-000000000003', key: 'utm_source', label: 'Origem UTM', kind: 'utm', value: null },
    ],
  }
}
