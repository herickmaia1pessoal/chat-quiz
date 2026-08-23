'use client'

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Play,
  Plus,
  Route,
  Trash2,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  ComparisonOperator,
  FlowCondition,
  FlowConditionGroup,
  FlowConditionSource,
  FunnelDocument,
  FunnelFlowConnection,
  FunnelFlowDefinition,
  FunnelFlowScoringRule,
  FunnelResultRange,
} from '@/lib/funnel/types'
import {
  createLinearFlowConnections,
  getFunnelFlowDefinition,
  materializeFunnelFlow,
  simulateFunnelPath,
  validateFunnelFlow,
  type FlowSimulationResult,
} from '@/lib/funnel/flow'

interface FlowViewProps {
  document: FunnelDocument
  activePageId: string
  onSelectPage: (id: string) => void
  onChange: (updater: (document: FunnelDocument) => FunnelDocument) => void
}

const operators: Array<{ value: ComparisonOperator; label: string }> = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'greater_than', label: 'é maior que' },
  { value: 'less_than', label: 'é menor que' },
  { value: 'is_empty', label: 'está vazio' },
  { value: 'is_not_empty', label: 'não está vazio' },
]

const sources: Array<{ value: FlowConditionSource; label: string }> = [
  { value: 'answer', label: 'Resposta' },
  { value: 'variable', label: 'Variável' },
  { value: 'score', label: 'Score' },
  { value: 'utm', label: 'UTM' },
]

const inputClass = 'h-8 min-w-0 rounded-lg border border-white/10 bg-black/25 px-2 text-[10px] text-zinc-200 outline-none transition focus:border-violet-400/50'

function createId() {
  return crypto.randomUUID()
}

function defaultCondition(key = 'resposta'): FlowCondition {
  return { id: createId(), source: 'answer', key, operator: 'equals', value: '' }
}

function ConditionEditor({
  group,
  answerKeys,
  variableKeys,
  onChange,
}: {
  group: FlowConditionGroup
  answerKeys: string[]
  variableKeys: string[]
  onChange: (group: FlowConditionGroup) => void
}) {
  const update = (index: number, updater: (condition: FlowCondition) => FlowCondition) => {
    onChange({
      ...group,
      conditions: group.conditions.map((condition, current) => current === index ? updater(condition) : condition),
    })
  }

  return (
    <div className="space-y-2">
      {group.conditions.length > 1 && (
        <label className="flex items-center gap-2 text-[9px] text-zinc-500">
          Combinar com
          <select value={group.operator} onChange={(event) => onChange({ ...group, operator: event.target.value as 'and' | 'or' })} className={inputClass}>
            <option value="and">E</option><option value="or">OU</option>
          </select>
        </label>
      )}
      {group.conditions.map((condition, index) => {
        const keys = condition.source === 'utm'
          ? ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
          : condition.source === 'variable' ? variableKeys : answerKeys
        const hidesValue = condition.operator === 'is_empty' || condition.operator === 'is_not_empty'
        return (
          <div key={condition.id} className="grid grid-cols-[82px_minmax(86px,1fr)_106px_minmax(76px,1fr)_28px] gap-1">
            <select
              aria-label="Origem"
              value={condition.source}
              onChange={(event) => {
                const source = event.target.value as FlowConditionSource
                const key = source === 'score' ? 'score' : source === 'utm' ? 'utm_source' : source === 'variable' ? variableKeys[0] || 'variavel' : answerKeys[0] || 'resposta'
                update(index, (current) => ({ ...current, source, key }))
              }}
              className={inputClass}
            >
              {sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </select>
            <input
              aria-label="Chave"
              list={`flow-keys-${condition.source}`}
              value={condition.source === 'score' ? 'score' : condition.key}
              disabled={condition.source === 'score'}
              onChange={(event) => update(index, (current) => ({ ...current, key: event.target.value }))}
              className={inputClass}
              placeholder="chave"
            />
            <select aria-label="Operador" value={condition.operator} onChange={(event) => update(index, (current) => ({ ...current, operator: event.target.value as ComparisonOperator }))} className={inputClass}>
              {operators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
            </select>
            <input aria-label="Valor" value={hidesValue ? '' : String(condition.value ?? '')} disabled={hidesValue} onChange={(event) => update(index, (current) => ({ ...current, value: event.target.value }))} className={inputClass} placeholder={hidesValue ? '—' : 'valor'} />
            <button type="button" aria-label="Excluir condição" onClick={() => onChange({ ...group, conditions: group.conditions.filter((_, current) => current !== index) })} className="flex size-7 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-3" /></button>
            {!!keys.length && <datalist id={`flow-keys-${condition.source}`}>{keys.map((key) => <option key={key} value={key} />)}</datalist>}
          </div>
        )
      })}
      <button type="button" onClick={() => onChange({ ...group, conditions: [...group.conditions, defaultCondition(answerKeys[0])] })} className="inline-flex h-7 items-center gap-1 rounded-lg border border-dashed border-white/10 px-2 text-[9px] font-semibold text-zinc-500 hover:border-violet-400/30 hover:text-violet-300"><Plus className="size-3" /> Condição</button>
    </div>
  )
}

function pageLabel(document: FunnelDocument, pageId: string) {
  return document.pages.find((page) => page.id === pageId)?.name ?? 'Página removida'
}

function pathLabel(document: FunnelDocument, simulation: FlowSimulationResult) {
  return simulation.path.map((pageId) => pageLabel(document, pageId)).join(' → ')
}

export function FlowView({ document, activePageId, onSelectPage, onChange }: FlowViewProps) {
  const pages = useMemo(() => [...document.pages].sort((left, right) => left.order - right.order), [document.pages])
  const flowDefinition = useMemo(() => getFunnelFlowDefinition(document), [document])
  const connections = flowDefinition?.connections ?? createLinearFlowConnections(document)
  const validation = useMemo(() => validateFunnelFlow(document), [document])
  const [simulatorInput, setSimulatorInput] = useState('{\n  "resposta": "valor",\n  "utm_source": "instagram"\n}')
  const [simulation, setSimulation] = useState<FlowSimulationResult | null>(null)
  const [simulatorError, setSimulatorError] = useState('')
  const selectedPage = pages.find((page) => page.id === activePageId) ?? pages[0]
  const answerKeys = useMemo(() => Array.from(new Set(document.elements.flatMap((element) => (
    typeof element.content.fieldKey === 'string' ? [element.content.fieldKey] : []
  )))), [document.elements])
  const variableKeys = useMemo(() => document.variables.map((variable) => variable.key), [document.variables])

  const updateFlow = (updater: (flow: FunnelFlowDefinition) => FunnelFlowDefinition) => {
    onChange((current) => {
      const nextFlow = updater(materializeFunnelFlow(current))
      return {
        ...current,
        flow: nextFlow,
        settings: { ...current.settings, flow: nextFlow },
      }
    })
  }
  const updateConnection = (id: string, updater: (connection: FunnelFlowConnection) => FunnelFlowConnection) => {
    updateFlow((flow) => ({ ...flow, connections: (flow.connections ?? []).map((item) => item.id === id ? updater(item) : item) }))
  }
  const removeConnection = (id: string) => {
    updateFlow((flow) => ({ ...flow, connections: (flow.connections ?? []).filter((item) => item.id !== id) }))
  }
  const addConnection = () => {
    if (!selectedPage || pages.length < 2) return
    const target = pages.find((page) => page.id !== selectedPage.id)
    if (!target) return
    const outgoing = connections.filter((item) => item.sourcePageId === selectedPage.id)
    const isDefault = !outgoing.some((item) => item.isDefault)
    updateFlow((flow) => ({
      ...flow,
      connections: [...(flow.connections ?? []), {
        id: createId(),
        sourcePageId: selectedPage.id,
        targetPageId: target.id,
        priority: outgoing.length,
        isDefault,
        condition: isDefault ? undefined : { operator: 'and', conditions: [defaultCondition(answerKeys[0])] },
      }],
    }))
  }
  const addScoreRule = () => {
    updateFlow((flow) => ({
      ...flow,
      scoringRules: [...(flow.scoringRules ?? []), {
        id: createId(),
        label: 'Nova regra',
        points: 1,
        condition: { operator: 'and', conditions: [defaultCondition(answerKeys[0])] },
      }],
    }))
  }
  const updateScoreRule = (id: string, updater: (rule: FunnelFlowScoringRule) => FunnelFlowScoringRule) => {
    updateFlow((flow) => ({ ...flow, scoringRules: (flow.scoringRules ?? []).map((item) => item.id === id ? updater(item) : item) }))
  }
  const addResultRange = () => {
    if (!selectedPage || pages.length < 2) return
    const target = pages.find((page) => page.id !== selectedPage.id)
    if (!target) return
    updateFlow((flow) => ({
      ...flow,
      resultRanges: [...(flow.resultRanges ?? []), {
        id: createId(),
        label: 'Novo resultado',
        resultKey: `resultado_${(flow.resultRanges?.length ?? 0) + 1}`,
        sourcePageId: selectedPage.id,
        targetPageId: target.id,
        minScore: 0,
        maxScore: 10,
      }],
    }))
  }
  const updateResultRange = (id: string, updater: (range: FunnelResultRange) => FunnelResultRange) => {
    updateFlow((flow) => ({ ...flow, resultRanges: (flow.resultRanges ?? []).map((item) => item.id === id ? updater(item) : item) }))
  }
  const runSimulation = () => {
    try {
      const values = JSON.parse(simulatorInput) as unknown
      if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error()
      const entries = values as Record<string, unknown>
      const rawActions = entries.__actions
      const actions = rawActions && !Array.isArray(rawActions) && typeof rawActions === 'object'
        ? Object.fromEntries(Object.entries(rawActions).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
        : undefined
      const answers = Object.fromEntries(Object.entries(entries).filter(([key]) => key !== '__actions'))
      const utms = Object.fromEntries(Object.entries(answers).filter(([key]) => key.startsWith('utm_')))
      setSimulation(simulateFunnelPath(document, { answers, variables: answers, utms, actions }))
      setSimulatorError('')
    } catch {
      setSimulation(null)
      setSimulatorError('Use um objeto JSON válido com as chaves e respostas do teste.')
    }
  }

  if (!selectedPage) {
    return <div className="flex min-h-full items-center justify-center text-sm text-zinc-600">Crie uma página para configurar o fluxo.</div>
  }

  const outgoing = connections.filter((item) => item.sourcePageId === selectedPage.id)
  const selectedRanges = (flowDefinition?.resultRanges ?? []).filter((range) => range.sourcePageId === selectedPage.id)
  const selectedIssues = validation.issues.filter((issue) => !issue.pageId || issue.pageId === selectedPage.id)

  return (
    <div className="mx-auto w-full max-w-[1460px] space-y-5 p-8" onClick={(event) => event.stopPropagation()}>
      <section className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#101014]/95 p-4 shadow-2xl shadow-black/25">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-100"><GitBranch className="size-4 text-violet-400" /> Fluxo e ramificações</div>
          <p className="mt-1 text-[10px] text-zinc-500">Condições são avaliadas por prioridade; faixa de resultado e destino padrão vêm em seguida.</p>
        </div>
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-semibold ${validation.valid ? 'border-emerald-400/15 bg-emerald-400/[.06] text-emerald-300' : 'border-amber-400/20 bg-amber-400/[.06] text-amber-200'}`}>
          {validation.valid ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {validation.valid ? 'Pronto para publicar' : `${validation.issues.length} ajuste(s) bloqueiam a publicação`}
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-5">
        <div className="space-y-5">
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/95 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-xs font-bold text-zinc-200">Mapa de páginas</h2><p className="mt-1 text-[9px] text-zinc-600">Selecione um nó para editar as suas saídas.</p></div>
              <label className="flex items-center gap-2 text-[9px] text-zinc-500">
                Entrada
                <select value={flowDefinition?.entryPageId ?? validation.entryPageId ?? ''} onChange={(event) => updateFlow((flow) => ({ ...flow, entryPageId: event.target.value }))} className={inputClass}>
                  {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {pages.map((page, index) => {
                const pageOutgoing = connections.filter((item) => item.sourcePageId === page.id)
                const pageIssues = validation.issues.filter((issue) => issue.pageId === page.id)
                const isEntry = validation.entryPageId === page.id
                return (
                  <button type="button" key={page.id} onClick={() => onSelectPage(page.id)} className={`group min-h-32 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${page.id === selectedPage.id ? 'border-violet-400/45 bg-violet-500/[.09] shadow-lg shadow-violet-950/30' : pageIssues.length ? 'border-amber-400/20 bg-amber-400/[.035]' : 'border-white/[.08] bg-[#15151b] hover:border-white/20'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold uppercase tracking-[.16em] text-zinc-600">Página {index + 1}</span>
                      {isEntry ? <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[7px] font-bold text-emerald-300">ENTRADA</span> : pageIssues.length > 0 ? <AlertTriangle className="size-3 text-amber-400" /> : null}
                    </div>
                    <p className="mt-3 truncate text-xs font-bold text-zinc-100">{page.name}</p>
                    <div className="mt-3 space-y-1">
                      {pageOutgoing.slice(0, 2).map((connection) => <span key={connection.id} className="flex items-center gap-1 truncate text-[8px] text-zinc-500"><ArrowRight className="size-2.5 shrink-0 text-violet-400/70" />{connection.isDefault ? 'Padrão: ' : 'Se: '}{pageLabel(document, connection.targetPageId)}</span>)}
                      {!pageOutgoing.length && <span className="text-[8px] text-zinc-700">Página final</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/95 p-5">
            <div className="flex items-center justify-between">
              <div><h2 className="flex items-center gap-2 text-xs font-bold text-zinc-200"><Trophy className="size-3.5 text-amber-400" /> Pontuação condicional</h2><p className="mt-1 text-[9px] text-zinc-600">Regras por opção continuam no elemento; aqui você combina respostas, variáveis e UTMs.</p></div>
              <button type="button" onClick={addScoreRule} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[9px] font-semibold text-zinc-400 hover:border-violet-400/30 hover:text-violet-300"><Plus className="size-3" /> Regra</button>
            </div>
            <div className="mt-4 space-y-3">
              {(flowDefinition?.scoringRules ?? []).map((rule) => (
                <div key={rule.id} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <input value={rule.label ?? ''} onChange={(event) => updateScoreRule(rule.id, (current) => ({ ...current, label: event.target.value }))} className={`${inputClass} flex-1`} placeholder="Nome da regra" />
                    <label className="flex items-center gap-1 text-[9px] text-zinc-500">Pontos <input type="number" value={rule.points} onChange={(event) => updateScoreRule(rule.id, (current) => ({ ...current, points: Number(event.target.value) }))} className={`${inputClass} w-20`} /></label>
                    <button type="button" aria-label="Excluir regra de pontuação" onClick={() => updateFlow((flow) => ({ ...flow, scoringRules: (flow.scoringRules ?? []).filter((item) => item.id !== rule.id) }))} className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-3.5" /></button>
                  </div>
                  <ConditionEditor group={rule.condition} answerKeys={answerKeys} variableKeys={variableKeys} onChange={(condition) => updateScoreRule(rule.id, (current) => ({ ...current, condition }))} />
                </div>
              ))}
              {!flowDefinition?.scoringRules?.length && <div className="rounded-xl border border-dashed border-white/[.07] p-5 text-center text-[9px] text-zinc-700">Nenhuma regra global de score.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/95 p-5">
            <div className="flex items-center justify-between">
              <div><h2 className="flex items-center gap-2 text-xs font-bold text-zinc-200"><Play className="size-3.5 text-cyan-400" /> Simulador de percurso</h2><p className="mt-1 text-[9px] text-zinc-600">Informe respostas/variáveis em JSON. Para um botão “Ir para página”, use <code>{'"__actions":{"slug-origem":"slug-destino"}'}</code>.</p></div>
              <button type="button" onClick={runSimulation} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/15"><Play className="size-3" /> Simular</button>
            </div>
            <textarea value={simulatorInput} onChange={(event) => setSimulatorInput(event.target.value)} spellCheck={false} className="mt-4 min-h-24 w-full rounded-xl border border-white/[.08] bg-black/30 p-3 font-mono text-[10px] leading-5 text-zinc-300 outline-none focus:border-cyan-400/30" />
            {simulatorError && <p className="mt-2 text-[9px] text-rose-300">{simulatorError}</p>}
            {simulation && <div className={`mt-3 rounded-xl border p-3 ${simulation.stopReason === 'terminal' ? 'border-emerald-400/15 bg-emerald-400/[.04]' : 'border-amber-400/20 bg-amber-400/[.04]'}`}><div className="flex items-center justify-between text-[9px]"><span className="font-semibold text-zinc-300">{pathLabel(document, simulation)}</span><span className="rounded-full bg-white/5 px-2 py-1 font-mono text-zinc-400">score {simulation.score}</span></div><p className="mt-2 text-[8px] text-zinc-600">Parada: {simulation.stopReason}{simulation.resultKey ? ` · resultado: ${simulation.resultKey}` : ''}</p></div>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.08] bg-[#111116] p-4 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between">
              <div><span className="text-[8px] font-bold uppercase tracking-[.14em] text-violet-400">Saídas da página</span><h2 className="mt-1 text-sm font-bold text-zinc-100">{selectedPage.name}</h2></div>
              <button type="button" onClick={addConnection} disabled={pages.length < 2} className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:border-violet-400/30 hover:text-violet-300 disabled:opacity-30" aria-label="Adicionar rota"><Plus className="size-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              {outgoing.map((connection, index) => (
                <div key={connection.id} className="rounded-xl border border-white/[.07] bg-black/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex size-6 items-center justify-center rounded-lg ${connection.isDefault ? 'bg-cyan-400/10 text-cyan-300' : 'bg-violet-400/10 text-violet-300'}`}>{connection.isDefault ? <Route className="size-3" /> : <GitBranch className="size-3" />}</span>
                    <select value={connection.targetPageId} onChange={(event) => updateConnection(connection.id, (current) => ({ ...current, targetPageId: event.target.value }))} className={`${inputClass} flex-1`}>
                      {pages.filter((page) => page.id !== selectedPage.id).map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                    </select>
                    <button type="button" aria-label="Excluir rota" onClick={() => removeConnection(connection.id)} className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-3.5" /></button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[9px] text-zinc-500">
                      <input
                        type="checkbox"
                        checked={Boolean(connection.isDefault)}
                        onChange={(event) => {
                          const makeDefault = event.target.checked
                          updateFlow((flow) => ({
                            ...flow,
                            connections: (flow.connections ?? []).map((item) => {
                              if (item.sourcePageId !== selectedPage.id) return item
                              if (item.id === connection.id) return { ...item, isDefault: makeDefault, condition: makeDefault ? undefined : { operator: 'and', conditions: [defaultCondition(answerKeys[0])] } }
                              return makeDefault ? { ...item, isDefault: false, condition: item.condition ?? { operator: 'and', conditions: [defaultCondition(answerKeys[0])] } } : item
                            }),
                          }))
                        }}
                        className="accent-violet-500"
                      />
                      Destino padrão
                    </label>
                    <label className="flex items-center gap-1 text-[8px] text-zinc-600">Prioridade <input type="number" value={connection.priority ?? index} onChange={(event) => updateConnection(connection.id, (current) => ({ ...current, priority: Number(event.target.value) }))} className={`${inputClass} w-14`} /></label>
                  </div>
                  {!connection.isDefault && <div className="mt-3 border-t border-white/[.06] pt-3"><ConditionEditor group={connection.condition ?? { operator: 'and', conditions: [] }} answerKeys={answerKeys} variableKeys={variableKeys} onChange={(condition) => updateConnection(connection.id, (current) => ({ ...current, condition }))} /></div>}
                </div>
              ))}
              {!outgoing.length && <div className="rounded-xl border border-dashed border-white/[.08] p-5 text-center"><CircleDot className="mx-auto size-5 text-zinc-700" /><p className="mt-2 text-[9px] text-zinc-600">Esta é uma página final. Adicione uma rota para continuar.</p></div>}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#111116] p-4">
            <div className="flex items-center justify-between">
              <div><span className="text-[8px] font-bold uppercase tracking-[.14em] text-amber-400">Resultados por score</span><p className="mt-1 text-[9px] text-zinc-600">Avaliados antes do destino padrão.</p></div>
              <button type="button" onClick={addResultRange} disabled={pages.length < 2} className="flex size-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 hover:text-amber-300 disabled:opacity-30"><Plus className="size-3.5" /></button>
            </div>
            <div className="mt-3 space-y-2">
              {selectedRanges.map((range) => (
                <div key={range.id} className="rounded-xl border border-white/[.07] bg-black/20 p-3">
                  <div className="flex items-center gap-1.5">
                    <input value={range.label} onChange={(event) => updateResultRange(range.id, (current) => ({ ...current, label: event.target.value }))} className={`${inputClass} flex-1`} placeholder="Nome do resultado" />
                    <button type="button" aria-label="Excluir resultado" onClick={() => updateFlow((flow) => ({ ...flow, resultRanges: (flow.resultRanges ?? []).filter((item) => item.id !== range.id) }))} className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-3.5" /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <input aria-label="Score mínimo" type="number" value={range.minScore ?? ''} onChange={(event) => updateResultRange(range.id, (current) => ({ ...current, minScore: event.target.value === '' ? undefined : Number(event.target.value) }))} className={inputClass} placeholder="Score mín." />
                    <input aria-label="Score máximo" type="number" value={range.maxScore ?? ''} onChange={(event) => updateResultRange(range.id, (current) => ({ ...current, maxScore: event.target.value === '' ? undefined : Number(event.target.value) }))} className={inputClass} placeholder="Score máx." />
                    <select aria-label="Página de resultado" value={range.targetPageId} onChange={(event) => updateResultRange(range.id, (current) => ({ ...current, targetPageId: event.target.value }))} className={`${inputClass} col-span-2`}>
                      {pages.filter((page) => page.id !== selectedPage.id).map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                    </select>
                    <input aria-label="Chave do resultado" value={range.resultKey ?? ''} onChange={(event) => updateResultRange(range.id, (current) => ({ ...current, resultKey: event.target.value }))} className={`${inputClass} col-span-2`} placeholder="Chave do resultado" />
                  </div>
                </div>
              ))}
              {!selectedRanges.length && <p className="rounded-xl border border-dashed border-white/[.07] p-4 text-center text-[9px] text-zinc-700">Nenhuma faixa nesta página.</p>}
            </div>
          </section>

          {!validation.valid && (
            <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[.035] p-4">
              <h3 className="flex items-center gap-2 text-[10px] font-bold text-amber-200"><AlertTriangle className="size-3.5" /> Corrija antes de publicar</h3>
              <ul className="mt-3 space-y-2">
                {selectedIssues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${issue.connectionId ?? issue.pageId ?? index}`} className="text-[9px] leading-4 text-amber-100/65">• {issue.message}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
