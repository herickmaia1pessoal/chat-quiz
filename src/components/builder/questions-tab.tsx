'use client'

import { useState } from 'react'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Check,
  ListCheck,
  AlignLeft,
  Sliders,
  GitBranch,
  X,
  ImageIcon,
  ListTree,
  MessageSquareQuote,
  Columns2,
  Timer,
  Calculator,
  AlertTriangle,
  Quote,
  BellRing,
  MousePointerClick,
  MoveVertical,
  BarChart3,
  Move,
  Music,
  Layers,
  FileStack,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { saveQuestions } from '@/app/dashboard/actions'

interface BranchingRule {
  option_id: string
  go_to_order: number
}

interface Option {
  id?: string
  text: string
  order_num: number
  score_value?: number
  image_url?: string
}

interface ComparisonRow {
  label: string
  left_text: string
  right_text: string
}

interface ChartBar {
  label: string
  value: number
}

interface QuadrantPoint {
  label: string
  x: number
  y: number
  highlighted?: boolean
}

interface QuestionSettings {
  // content block
  body?: string
  testimonial_text?: string
  testimonial_author?: string
  cta_label?: string
  // comparison block
  left_label?: string
  right_label?: string
  rows?: ComparisonRow[]
  // timer block
  duration_seconds?: number
  // numeric_calc block
  field_a_label?: string
  field_a_placeholder?: string
  field_b_label?: string
  field_b_placeholder?: string
  formula?: 'bmi' | 'difference' | 'none'
  // alert block
  alert_variant?: 'info' | 'warning' | 'success' | 'danger'
  // testimonial block (standalone, can repeat multiple per quiz)
  author_role?: string
  rating?: number
  avatar_url?: string
  // social_proof block (floating "fulano acabou de comprar" notification)
  notification_name?: string
  notification_action?: string
  notification_time_label?: string
  // button block (standalone CTA, doesn't capture an answer)
  button_url?: string
  button_open_new_tab?: boolean
  // chart block
  chart_bars?: ChartBar[]
  chart_unit?: string
  // quadrant block (cartesian X/Y plot)
  quadrant_x_label?: string
  quadrant_y_label?: string
  quadrant_points?: QuadrantPoint[]
  // audio block
  audio_url?: string
}

interface Question {
  id?: string
  title: string
  description?: string
  type: string
  order_num: number
  options?: Option[]
  settings?: QuestionSettings
}

// A step is one screen the player navigates between. It can hold several
// content blocks stacked together (e.g. an Alert + a Multiple Choice on the
// same screen) — branching is a per-step decision (which step comes next),
// evaluated once an answer is given inside it.
interface Step {
  id?: string
  order_num: number
  title?: string
  branching_rules?: BranchingRule[]
  blocks: Question[]
}

const LIKERT_OPTIONS = [
  'Concordo totalmente',
  'Concordo parcialmente',
  'Neutro',
  'Discordo parcialmente',
  'Discordo totalmente',
]

// Blocks that are purely narrative/decorative — they never capture an
// answer, so they're excluded from "Pergunta X de Y" numbering and from
// {{resposta_N}} resolution, same treatment content/comparison/timer always
// had. chart/quadrant can still *reference* earlier answers in their text
// via interpolation, they just don't produce one of their own.
const NARRATIVE_TYPES = [
  'content', 'comparison', 'timer',
  'alert', 'testimonial', 'social_proof', 'button', 'spacer', 'chart', 'quadrant', 'audio',
]

const OPTION_BASED_TYPES = ['multiple_choice', 'image_choice']

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Múltipla Escolha',
  text: 'Resposta Aberta',
  scale: 'Escala (1 a 5)',
  image_choice: 'Opções com Imagem',
  likert: 'Escala de Concordância',
  content: 'Interstício (Conteúdo)',
  comparison: 'Comparativo',
  timer: 'Timer de Escassez',
  numeric_calc: 'Cálculo Numérico',
  alert: 'Alerta',
  testimonial: 'Depoimento',
  social_proof: 'Notificação de Prova Social',
  button: 'Botão (CTA)',
  spacer: 'Espaçador',
  chart: 'Gráfico',
  quadrant: 'Cartesiano (Perfil)',
  audio: 'Áudio',
}

// The block palette shown in column 2 — same 17 types previously offered by
// the "Adicionar Bloco" bar, now always visible instead of pinned to the
// bottom of the page. Order mirrors TYPE_LABELS/newBlock/defaultSettingsFor.
const BLOCK_PALETTE: Array<{ type: string; label: string; icon: typeof ListCheck; color: string }> = [
  { type: 'multiple_choice', label: 'Múltipla Escolha', icon: ListCheck, color: 'text-indigo-400' },
  { type: 'text', label: 'Resposta Aberta', icon: AlignLeft, color: 'text-cyan-400' },
  { type: 'scale', label: 'Escala (1 a 5)', icon: Sliders, color: 'text-amber-400' },
  { type: 'image_choice', label: 'Opções com Imagem', icon: ImageIcon, color: 'text-pink-400' },
  { type: 'likert', label: 'Escala de Concordância', icon: ListTree, color: 'text-teal-400' },
  { type: 'content', label: 'Interstício (Conteúdo)', icon: MessageSquareQuote, color: 'text-violet-400' },
  { type: 'comparison', label: 'Comparativo', icon: Columns2, color: 'text-rose-400' },
  { type: 'timer', label: 'Timer de Escassez', icon: Timer, color: 'text-orange-400' },
  { type: 'numeric_calc', label: 'Cálculo Numérico', icon: Calculator, color: 'text-lime-400' },
  { type: 'alert', label: 'Alerta', icon: AlertTriangle, color: 'text-amber-400' },
  { type: 'testimonial', label: 'Depoimento', icon: Quote, color: 'text-fuchsia-400' },
  { type: 'social_proof', label: 'Notificação', icon: BellRing, color: 'text-sky-400' },
  { type: 'button', label: 'Botão', icon: MousePointerClick, color: 'text-indigo-300' },
  { type: 'spacer', label: 'Espaço', icon: MoveVertical, color: 'text-zinc-400' },
  { type: 'chart', label: 'Gráfico', icon: BarChart3, color: 'text-emerald-400' },
  { type: 'quadrant', label: 'Cartesiano', icon: Move, color: 'text-cyan-300' },
  { type: 'audio', label: 'Áudio', icon: Music, color: 'text-purple-400' },
]

// Shared between addBlock (new block) and updateBlock (type switch) so
// picking a type always seeds sensible defaults, never an empty settings
// object the editor UI would render as a wall of blank fields.
function defaultSettingsFor(type: string): QuestionSettings {
  switch (type) {
    case 'content':
      return { body: '', testimonial_text: '', testimonial_author: '', cta_label: 'Continuar' }
    case 'comparison':
      return {
        left_label: 'Sozinho (hoje)',
        right_label: 'Com a solução',
        rows: [{ label: 'Resultado', left_text: '', right_text: '' }],
      }
    case 'timer':
      return { body: '', duration_seconds: 300, cta_label: 'Continuar' }
    case 'numeric_calc':
      return { field_a_label: 'Peso (kg)', field_a_placeholder: '70', field_b_label: 'Altura (m)', field_b_placeholder: '1.75', formula: 'bmi' }
    case 'alert':
      return { body: 'Atenção: essa condição pode piorar com o tempo.', alert_variant: 'warning' }
    case 'testimonial':
      return { testimonial_text: '', testimonial_author: '', author_role: '', rating: 5, avatar_url: '' }
    case 'social_proof':
      return { notification_name: 'Maria S.', notification_action: 'acabou de garantir sua vaga', notification_time_label: 'há 2 minutos' }
    case 'button':
      return { body: '', cta_label: 'Continuar', button_url: '', button_open_new_tab: false }
    case 'spacer':
      return { duration_seconds: 24 } // reused as "height in px" for spacer
    case 'chart':
      return {
        body: '',
        chart_unit: '%',
        chart_bars: [
          { label: 'Pessoas como você', value: 68 },
          { label: 'Média geral', value: 34 },
        ],
      }
    case 'quadrant':
      return {
        quadrant_x_label: 'Eixo X',
        quadrant_y_label: 'Eixo Y',
        quadrant_points: [{ label: 'Você', x: 60, y: 70, highlighted: true }],
      }
    case 'audio':
      return { body: '', audio_url: '' }
    default:
      return {}
  }
}

function defaultTitleFor(type: string): string {
  switch (type) {
    case 'content': return 'Título do interstício'
    case 'comparison': return 'O que muda com a solução'
    case 'timer': return 'Oferta por tempo limitado'
    case 'numeric_calc': return 'Calcule seu resultado'
    case 'alert': return 'Atenção'
    case 'testimonial': return 'O que dizem sobre nós'
    case 'social_proof': return 'Notificação de prova social'
    case 'button': return 'Continue de onde parou'
    case 'spacer': return 'Espaçador'
    case 'chart': return 'Veja o que os dados mostram'
    case 'quadrant': return 'Seu posicionamento'
    case 'audio': return 'Ouça esta mensagem'
    default: return 'Nova Pergunta'
  }
}

function newBlock(type: string): Question {
  return {
    title: defaultTitleFor(type),
    description: '',
    type,
    order_num: 0,
    options:
      type === 'multiple_choice' || type === 'image_choice'
        ? [
            { text: 'Opção 1', order_num: 0 },
            { text: 'Opção 2', order_num: 1 },
          ]
        : type === 'likert'
        ? LIKERT_OPTIONS.map((text, order_num) => ({ text, order_num }))
        : [],
    settings: defaultSettingsFor(type),
  }
}

const isNarrativeBlock = (type: string) => NARRATIVE_TYPES.includes(type)

export function QuestionsTab({
  quizId,
  initialSteps,
  scoringEnabled = false,
}: {
  quizId: string
  initialSteps: Step[]
  scoringEnabled?: boolean
}) {
  const [steps, setSteps] = useState<Step[]>(
    initialSteps.length > 0
      ? initialSteps
      : [
          {
            order_num: 0,
            branching_rules: [],
            blocks: [
              {
                title: 'Qual é o seu principal objetivo hoje?',
                description: 'Selecione a opção que melhor descreve seu momento.',
                type: 'multiple_choice',
                order_num: 0,
                options: [
                  { text: 'Aumentar minhas vendas', order_num: 0 },
                  { text: 'Reduzir custos por lead (CPL)', order_num: 1 },
                  { text: 'Organizar meus processos internos', order_num: 2 },
                ],
              },
            ],
          },
        ]
  )

  const [selectedStepIndex, setSelectedStepIndex] = useState(0)
  // Which block within the selected step is showing in the properties
  // panel — reset to 0 whenever the step changes so the panel never points
  // at a block index that belongs to a different (or no longer selected) step.
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [expandedBranching, setExpandedBranching] = useState(false)
  const [propertiesTab, setPropertiesTab] = useState<'component' | 'style' | 'display'>('component')

  const selectStep = (stepIdx: number) => {
    setSelectedStepIndex(stepIdx)
    setSelectedBlockIndex(0)
  }

  const selectedStep = steps[selectedStepIndex] as Step | undefined
  const selectedBlock = selectedStep?.blocks[Math.min(selectedBlockIndex, (selectedStep?.blocks.length || 1) - 1)] as Question | undefined
  const effectiveBlockIndex = Math.min(selectedBlockIndex, (selectedStep?.blocks.length || 1) - 1)

  // Flattened list of every block across every step, in play order — the
  // basis for "Pergunta X de Y" numbering and the {{resposta_N}} hint shown
  // per block, since both need one linear position regardless of grouping.
  const allBlocks = steps.flatMap((s) => s.blocks)
  const answerablePositionOf = (block: Question) => {
    const globalIdx = allBlocks.indexOf(block)
    return allBlocks.slice(0, globalIdx + 1).filter((b) => !isNarrativeBlock(b.type)).length
  }

  // ─── Step-level helpers ───
  const addStep = () => {
    const next = [...steps, { order_num: steps.length, branching_rules: [], blocks: [newBlock('multiple_choice')] }]
    setSteps(next)
    setSelectedStepIndex(next.length - 1)
  }

  const removeStep = (stepIdx: number) => {
    const next = steps.filter((_, i) => i !== stepIdx)
    setSteps(next)
    setSelectedStepIndex((prev) => Math.min(prev, next.length - 1))
  }

  const moveStep = (stepIdx: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && stepIdx === 0) || (direction === 'down' && stepIdx === steps.length - 1)) return
    const next = [...steps]
    const target = direction === 'up' ? stepIdx - 1 : stepIdx + 1
    ;[next[stepIdx], next[target]] = [next[target], next[stepIdx]]
    setSteps(next)
    if (selectedStepIndex === stepIdx) setSelectedStepIndex(target)
    else if (selectedStepIndex === target) setSelectedStepIndex(stepIdx)
  }

  const updateStepTitle = (stepIdx: number, title: string) => {
    const next = [...steps]
    next[stepIdx] = { ...next[stepIdx], title }
    setSteps(next)
  }

  // ─── Block-level helpers (operate on the currently selected step) ───
  const addBlock = (type: string) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks, newBlock(type)]
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
    setSelectedBlockIndex(blocks.length - 1)
  }

  const removeBlock = (blockIdx: number) => {
    const next = [...steps]
    const step = next[selectedStepIndex]
    const removedBlock = step.blocks[blockIdx]
    next[selectedStepIndex] = { ...step, blocks: step.blocks.filter((_, i) => i !== blockIdx) }
    // A block's options may be referenced by this step's branching rules —
    // drop any rule pointing at an option that no longer exists.
    if (removedBlock?.options?.length && next[selectedStepIndex].branching_rules?.length) {
      const removedOptionIds = new Set(removedBlock.options.map((o) => o.id).filter(Boolean))
      next[selectedStepIndex].branching_rules = next[selectedStepIndex].branching_rules!.filter(
        (r) => !removedOptionIds.has(r.option_id)
      )
    }
    setSteps(next)
    setSelectedBlockIndex((prev) => Math.min(prev, next[selectedStepIndex].blocks.length - 1))
  }

  const moveBlock = (blockIdx: number, direction: 'up' | 'down') => {
    const step = steps[selectedStepIndex]
    if ((direction === 'up' && blockIdx === 0) || (direction === 'down' && blockIdx === step.blocks.length - 1)) return
    const next = [...steps]
    const blocks = [...step.blocks]
    const target = direction === 'up' ? blockIdx - 1 : blockIdx + 1
    ;[blocks[blockIdx], blocks[target]] = [blocks[target], blocks[blockIdx]]
    next[selectedStepIndex] = { ...step, blocks }
    setSteps(next)
    if (selectedBlockIndex === blockIdx) setSelectedBlockIndex(target)
    else if (selectedBlockIndex === target) setSelectedBlockIndex(blockIdx)
  }

  const updateBlock = (blockIdx: number, field: keyof Question, value: any) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    blocks[blockIdx] = { ...blocks[blockIdx], [field]: value }
    if (field === 'type') {
      const needsOptions = OPTION_BASED_TYPES.includes(value)
      if (needsOptions && !blocks[blockIdx].options?.length) {
        blocks[blockIdx].options = [
          { text: 'Opção 1', order_num: 0 },
          { text: 'Opção 2', order_num: 1 },
        ]
      } else if (value === 'likert' && !blocks[blockIdx].options?.length) {
        blocks[blockIdx].options = LIKERT_OPTIONS.map((text, order_num) => ({ text, order_num }))
      } else if (
        // Only seed defaults the first time a narrative/composite type is
        // picked — switching back and forth shouldn't clobber content the
        // user already typed in.
        [...NARRATIVE_TYPES, 'numeric_calc'].includes(value) &&
        !Object.keys(blocks[blockIdx].settings || {}).length
      ) {
        blocks[blockIdx].settings = defaultSettingsFor(value)
      }
    }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const updateSettings = (blockIdx: number, field: keyof QuestionSettings, value: any) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, [field]: value } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const addComparisonRow = (blockIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const rows = blocks[blockIdx].settings?.rows || []
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, rows: [...rows, { label: '', left_text: '', right_text: '' }] } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const updateComparisonRow = (blockIdx: number, rowIdx: number, field: keyof ComparisonRow, value: string) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const rows = [...(blocks[blockIdx].settings?.rows || [])]
    rows[rowIdx] = { ...rows[rowIdx], [field]: value }
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, rows } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const removeComparisonRow = (blockIdx: number, rowIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const rows = (blocks[blockIdx].settings?.rows || []).filter((_, i) => i !== rowIdx)
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, rows } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  // Chart bars (used by the 'chart' block type)
  const addChartBar = (blockIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const bars = blocks[blockIdx].settings?.chart_bars || []
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, chart_bars: [...bars, { label: '', value: 50 }] } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const updateChartBar = (blockIdx: number, barIdx: number, field: keyof ChartBar, value: string | number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const bars = [...(blocks[blockIdx].settings?.chart_bars || [])]
    bars[barIdx] = { ...bars[barIdx], [field]: field === 'value' ? Number(value) : value }
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, chart_bars: bars } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const removeChartBar = (blockIdx: number, barIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const bars = (blocks[blockIdx].settings?.chart_bars || []).filter((_, i) => i !== barIdx)
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, chart_bars: bars } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  // Quadrant points (used by the 'quadrant' block type)
  const addQuadrantPoint = (blockIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const points = blocks[blockIdx].settings?.quadrant_points || []
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, quadrant_points: [...points, { label: '', x: 50, y: 50 }] } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const updateQuadrantPoint = (blockIdx: number, pointIdx: number, field: keyof QuadrantPoint, value: string | number | boolean) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const points = [...(blocks[blockIdx].settings?.quadrant_points || [])]
    points[pointIdx] = { ...points[pointIdx], [field]: value }
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, quadrant_points: points } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const removeQuadrantPoint = (blockIdx: number, pointIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const points = (blocks[blockIdx].settings?.quadrant_points || []).filter((_, i) => i !== pointIdx)
    blocks[blockIdx] = { ...blocks[blockIdx], settings: { ...blocks[blockIdx].settings, quadrant_points: points } }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const addOption = (blockIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    const opts = blocks[blockIdx].options || []
    blocks[blockIdx] = { ...blocks[blockIdx], options: [...opts, { text: `Opção ${opts.length + 1}`, order_num: opts.length }] }
    next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
    setSteps(next)
  }

  const updateOption = (blockIdx: number, optIdx: number, text: string) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    if (blocks[blockIdx].options) {
      const options = [...blocks[blockIdx].options!]
      options[optIdx] = { ...options[optIdx], text }
      blocks[blockIdx] = { ...blocks[blockIdx], options }
      next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
      setSteps(next)
    }
  }

  const updateOptionImage = (blockIdx: number, optIdx: number, imageUrl: string) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    if (blocks[blockIdx].options) {
      const options = [...blocks[blockIdx].options!]
      options[optIdx] = { ...options[optIdx], image_url: imageUrl }
      blocks[blockIdx] = { ...blocks[blockIdx], options }
      next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
      setSteps(next)
    }
  }

  const updateOptionScore = (blockIdx: number, optIdx: number, scoreValue: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    if (blocks[blockIdx].options) {
      const options = [...blocks[blockIdx].options!]
      options[optIdx] = { ...options[optIdx], score_value: scoreValue }
      blocks[blockIdx] = { ...blocks[blockIdx], options }
      next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
      setSteps(next)
    }
  }

  const removeOption = (blockIdx: number, optIdx: number) => {
    const next = [...steps]
    const blocks = [...next[selectedStepIndex].blocks]
    if (blocks[blockIdx].options) {
      const removedOpt = blocks[blockIdx].options![optIdx]
      blocks[blockIdx] = { ...blocks[blockIdx], options: blocks[blockIdx].options!.filter((_, i) => i !== optIdx) }
      next[selectedStepIndex] = { ...next[selectedStepIndex], blocks }
      // Remove step-level branching rules referencing the removed option
      if (removedOpt?.id && next[selectedStepIndex].branching_rules) {
        next[selectedStepIndex].branching_rules = next[selectedStepIndex].branching_rules!.filter(
          (r) => r.option_id !== removedOpt.id
        )
      }
      setSteps(next)
    }
  }

  // ─── Step-level branching rules ───
  const addBranchingRule = () => {
    const next = [...steps]
    const rules = next[selectedStepIndex].branching_rules || []
    next[selectedStepIndex] = { ...next[selectedStepIndex], branching_rules: [...rules, { option_id: '', go_to_order: selectedStepIndex + 2 }] }
    setSteps(next)
  }

  const updateBranchingRule = (rIdx: number, field: 'option_id' | 'go_to_order', value: any) => {
    const next = [...steps]
    const rules = [...(next[selectedStepIndex].branching_rules || [])]
    rules[rIdx] = { ...rules[rIdx], [field]: field === 'go_to_order' ? Number(value) : value }
    next[selectedStepIndex] = { ...next[selectedStepIndex], branching_rules: rules }
    setSteps(next)
  }

  const removeBranchingRule = (rIdx: number) => {
    const next = [...steps]
    next[selectedStepIndex] = {
      ...next[selectedStepIndex],
      branching_rules: (next[selectedStepIndex].branching_rules || []).filter((_, i) => i !== rIdx),
    }
    setSteps(next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveQuestions(quizId, steps)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar perguntas.')
    } finally {
      setSaving(false)
    }
  }

  // Every option-based block across the whole selected step, used to
  // populate the "SE resposta X" side of the branching rule editor — a step
  // usually has one, but nothing stops stacking more than one.
  const optionBlocksInSelectedStep = (selectedStep?.blocks || []).filter((b) => OPTION_BASED_TYPES.includes(b.type))

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Etapas & Blocos</h2>
          <p className="text-zinc-400 text-xs mt-0.5">
            Cada etapa é uma tela do quiz e pode conter vários blocos empilhados. Use a ramificação para criar caminhos entre etapas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="h-4 w-4" /> Alterações salvas!
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      {/* The 4-column layout needs real desktop width to stay legible —
          below xl, point people at a wider screen rather than cramming
          etapas/paleta/preview/propriedades into a column that can't fit
          any of them usefully. */}
      <div className="xl:hidden rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center space-y-2">
        <Layers className="h-6 w-6 text-zinc-600 mx-auto" />
        <p className="text-sm text-zinc-300 font-medium">Use uma tela maior para editar as etapas</p>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          O construtor de etapas e blocos foi desenhado para telas de desktop. Abra esta página numa janela mais larga para continuar editando.
        </p>
      </div>

      <div className="hidden xl:grid gap-3 xl:grid-cols-[64px_180px_1fr_320px] items-start">
        {/* ─── Column 1: Steps (compact, numbered) ─── */}
        <div className="space-y-2 sticky top-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl p-1.5 space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto">
            {steps.map((step, stepIdx) => {
              const label = step.title || step.blocks[0]?.title || `Etapa ${stepIdx + 1}`
              const isSelected = stepIdx === selectedStepIndex
              return (
                <button
                  key={stepIdx}
                  type="button"
                  onClick={() => selectStep(stepIdx)}
                  title={label}
                  className={`w-full rounded-xl py-2 flex flex-col items-center gap-0.5 transition group relative ${
                    isSelected
                      ? 'bg-indigo-600/15 border border-indigo-500/30 text-white'
                      : 'border border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                  }`}
                >
                  <span className={`h-6 w-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {stepIdx + 1}
                  </span>
                  <div className="flex items-center gap-0.5 h-3">
                    {step.blocks.length > 1 && <Layers className="h-2.5 w-2.5 text-zinc-500" />}
                    {(step.branching_rules?.length ?? 0) > 0 && <GitBranch className="h-2.5 w-2.5 text-purple-400" />}
                  </div>
                </button>
              )
            })}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={addStep}
            title="Nova Etapa"
            className="w-full border-dashed border-zinc-700 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 h-9">
            <FileStack className="h-3.5 w-3.5 text-indigo-400" />
          </Button>
        </div>

        {/* ─── Column 2: Block palette — always visible, click to insert
             into the selected step ─── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl p-2 space-y-0.5 max-h-[calc(100vh-220px)] overflow-y-auto sticky top-4">
          {BLOCK_PALETTE.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              disabled={!selectedStep}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-white transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon className={`h-4 w-4 shrink-0 ${color}`} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* ─── Column 3: Preview — clickable list of blocks in this step ─── */}
        <div className="space-y-3 min-w-0">
          {selectedStep && (
            <>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-xl">
                <Label className="text-zinc-400 text-xs">Nome interno da etapa (opcional, só para organização)</Label>
                <Input
                  value={selectedStep.title || ''}
                  onChange={(e) => updateStepTitle(selectedStepIndex, e.target.value)}
                  placeholder={selectedStep.blocks[0]?.title || `Etapa ${selectedStepIndex + 1}`}
                  className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs mt-1.5"
                />
              </div>

              {selectedStep.blocks.map((q, blockIdx) => {
                const answerablePosition = answerablePositionOf(q)
                const isAnswerable = !isNarrativeBlock(q.type)
                const isBlockSelected = blockIdx === effectiveBlockIndex

                return (
                  <button
                    key={blockIdx}
                    type="button"
                    onClick={() => setSelectedBlockIndex(blockIdx)}
                    className={`w-full text-left rounded-2xl border p-4 backdrop-blur-xl transition space-y-2 ${
                      isBlockSelected
                        ? 'border-indigo-500/50 bg-indigo-600/10 shadow-md shadow-indigo-500/10'
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-6 w-6 shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${
                          isBlockSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                        }`}>
                          {blockIdx + 1}
                        </span>
                        <span className="text-sm font-semibold text-zinc-200 truncate">{q.title || TYPE_LABELS[q.type]}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); moveBlock(blockIdx, 'up') }}
                          className={`p-1 rounded hover:bg-zinc-700 ${blockIdx === 0 ? 'text-zinc-700 pointer-events-none' : 'text-zinc-500 hover:text-zinc-200'}`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </span>
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); moveBlock(blockIdx, 'down') }}
                          className={`p-1 rounded hover:bg-zinc-700 ${blockIdx === selectedStep.blocks.length - 1 ? 'text-zinc-700 pointer-events-none' : 'text-zinc-500 hover:text-zinc-200'}`}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </span>
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); if (selectedStep.blocks.length > 1) removeBlock(blockIdx) }}
                          className={`p-1 rounded hover:bg-zinc-700 ${selectedStep.blocks.length > 1 ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-700 cursor-not-allowed'}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-8">
                      <Badge className="bg-zinc-800/80 border-zinc-700 text-zinc-400 text-[10px]">
                        {TYPE_LABELS[q.type] || q.type}
                      </Badge>
                      {isAnswerable && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          {`{{resposta_${answerablePosition}}}`}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}

              <Button type="button" variant="outline" size="sm" onClick={() => addBlock('multiple_choice')}
                className="w-full border-dashed border-zinc-700 bg-zinc-900/20 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 text-xs gap-2">
                <Plus className="h-3.5 w-3.5" />
                Adicionar bloco a esta etapa
              </Button>

              {/* ─── Step-level Branching Rules Panel ─── */}
              {optionBlocksInSelectedStep.length > 0 && steps.length > 1 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-xl space-y-3">
                  <button
                    type="button"
                    onClick={() => setExpandedBranching(!expandedBranching)}
                    className="flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Ramificação da Etapa
                    {(selectedStep.branching_rules?.length ?? 0) > 0 && (
                      <Badge className="bg-purple-500/10 border-purple-500/20 text-purple-400 text-[11px] ml-1">
                        {selectedStep.branching_rules!.length} regra(s)
                      </Badge>
                    )}
                  </button>

                  {expandedBranching && (
                    <div className="space-y-2 bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-4">
                      <p className="text-[11px] text-zinc-500">
                        Defina para qual etapa o usuário deve ser enviado dependendo da resposta escolhida nesta etapa. Sem regra = próxima etapa em sequência.
                      </p>

                      {(selectedStep.branching_rules || []).map((rule, rIdx) => (
                        <div key={rIdx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 py-2 border-b border-zinc-800/40 last:border-0">
                          <span className="text-[11px] text-zinc-500 uppercase font-semibold w-6">SE</span>
                          <Select
                            value={rule.option_id}
                            onValueChange={(val) => updateBranchingRule(rIdx, 'option_id', val)}
                          >
                            <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-200 text-xs h-8 flex-1">
                              <SelectValue placeholder="Escolher opção..." />
                            </SelectTrigger>
                            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                              {optionBlocksInSelectedStep.flatMap((block) =>
                                (block.options || []).map((opt, oi) => (
                                  <SelectItem key={opt.id || `${block.title}-${oi}`} value={opt.id || `opt-${oi}`}>
                                    {String.fromCharCode(65 + oi)}: {opt.text}
                                    {optionBlocksInSelectedStep.length > 1 ? ` (${block.title})` : ''}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <span className="text-[11px] text-zinc-500 uppercase font-semibold">IR PARA</span>
                          <Select
                            value={String(rule.go_to_order)}
                            onValueChange={(val) => updateBranchingRule(rIdx, 'go_to_order', val)}
                          >
                            <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-200 text-xs h-8 flex-1">
                              <SelectValue placeholder="Etapa destino..." />
                            </SelectTrigger>
                            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                              {steps
                                .filter((_, i) => i !== selectedStepIndex)
                                .map((destStep, di) => (
                                  <SelectItem key={di} value={String(destStep.order_num)}>
                                    Etapa {destStep.order_num + 1}: {(destStep.title || destStep.blocks[0]?.title || '').slice(0, 40)}
                                  </SelectItem>
                                ))}
                              <SelectItem value={String(steps.length)}>
                                → Captura de Lead (Final)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button type="button" variant="ghost" size="icon"
                            onClick={() => removeBranchingRule(rIdx)}
                            className="h-8 w-8 text-zinc-500 hover:text-red-400 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}

                      <Button type="button" variant="outline" size="sm"
                        onClick={addBranchingRule}
                        className="border-dashed border-purple-800 bg-purple-950/20 text-purple-400 hover:bg-purple-900/20 text-xs mt-1">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Adicionar Regra de Ramificação
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── Column 4: Properties panel for the selected block ─── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl sticky top-4 max-h-[calc(100vh-220px)] overflow-y-auto">
          {selectedBlock && (() => {
            const q = selectedBlock
            const blockIdx = effectiveBlockIndex
            const answerablePosition = answerablePositionOf(q)
            return (
              <div className="space-y-4 p-5">
                {/* Properties tabs — only "Componente" is functional today;
                    Estilo/Exibição are placeholders for a future iteration
                    (per-block visual overrides and conditional display). */}
                <div className="flex items-center gap-1 border-b border-zinc-800 -mx-5 px-5 pb-3">
                  {(['component', 'style', 'display'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      disabled={tab !== 'component'}
                      onClick={() => setPropertiesTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        propertiesTab === tab && tab === 'component'
                          ? 'bg-zinc-800 text-white'
                          : tab !== 'component'
                          ? 'text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tab === 'component' ? 'Componente' : tab === 'style' ? 'Estilo' : 'Exibição'}
                      {tab !== 'component' && <span className="ml-1 text-[9px] text-zinc-700">em breve</span>}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-300">{TYPE_LABELS[q.type] || q.type}</span>
                  {!isNarrativeBlock(q.type) && (
                    <span
                      className="text-[10px] font-mono text-zinc-500 bg-zinc-950/60 border border-zinc-800 rounded px-1.5 py-0.5"
                      title="Use este código em textos de perguntas ou telas posteriores para repetir a resposta desta pergunta"
                    >
                      {`{{resposta_${answerablePosition}}}`}
                    </span>
                  )}
                </div>

                {/* Title + Type */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Título do Bloco</Label>
                    <Input value={q.title}
                      onChange={(e) => updateBlock(blockIdx, 'title', e.target.value)}
                      placeholder="Enunciado da pergunta"
                      className="border-zinc-700 bg-zinc-950 text-zinc-100 font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Tipo</Label>
                    <Select value={q.type} onValueChange={(val) => updateBlock(blockIdx, 'type', val)}>
                      <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                        {BLOCK_PALETTE.map(({ type, label }) => (
                          <SelectItem key={type} value={type}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!isNarrativeBlock(q.type) && (
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Descrição ou Subtítulo (opcional)</Label>
                    <Input value={q.description || ''}
                      onChange={(e) => updateBlock(blockIdx, 'description', e.target.value)}
                      placeholder="Ex: Selecione apenas uma opção para continuar"
                      className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs" />
                  </div>
                )}

                {/* Options — shared by multiple_choice and image_choice */}
                    {(q.type === 'multiple_choice' || q.type === 'image_choice') && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-zinc-300 text-xs uppercase tracking-wider font-semibold">Opções</Label>
                          {scoringEnabled && (
                            <span className="text-[11px] text-zinc-500">Pontos por opção</span>
                          )}
                        </div>
                        {q.options?.map((opt, optIndex) => (
                          <div key={optIndex} className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500 font-mono w-4">{String.fromCharCode(65 + optIndex)}</span>
                            {q.type === 'image_choice' && (
                              <Input value={opt.image_url || ''}
                                onChange={(e) => updateOptionImage(blockIdx, optIndex, e.target.value)}
                                placeholder="URL da imagem"
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9 w-32 shrink-0 font-mono" />
                            )}
                            <Input value={opt.text}
                              onChange={(e) => updateOption(blockIdx, optIndex, e.target.value)}
                              placeholder={`Opção ${optIndex + 1}`}
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9" />
                            {scoringEnabled && (
                              <Input
                                type="number"
                                value={opt.score_value ?? 0}
                                onChange={(e) => updateOptionScore(blockIdx, optIndex, Number(e.target.value))}
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9 w-16 text-center shrink-0"
                                title="Pontos que esta opção soma ao resultado final"
                              />
                            )}
                            <Button type="button" variant="ghost" size="icon"
                              disabled={q.options!.length <= 1}
                              onClick={() => removeOption(blockIdx, optIndex)}
                              className="h-8 w-8 text-zinc-500 hover:text-red-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => addOption(blockIdx)}
                          className="mt-2 border-dashed border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800 text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                          Adicionar Opção
                        </Button>
                      </div>
                    )}

                    {/* Likert — fixed 5-point agreement scale, only scoring is editable */}
                    {q.type === 'likert' && (
                      <div className="space-y-2 pt-2">
                        <Label className="text-zinc-300 text-xs uppercase tracking-wider font-semibold">
                          Escala de Concordância (fixa)
                        </Label>
                        <div className="space-y-1.5">
                          {(q.options || []).map((opt, optIndex) => (
                            <div key={optIndex} className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-950/40 rounded-lg px-3 py-2 border border-zinc-800">
                              <span className="flex-1">{opt.text}</span>
                              {scoringEnabled && (
                                <Input
                                  type="number"
                                  value={opt.score_value ?? 0}
                                  onChange={(e) => updateOptionScore(blockIdx, optIndex, Number(e.target.value))}
                                  className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-8 w-16 text-center shrink-0"
                                  title="Pontos que esta resposta soma ao resultado final"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Os 5 níveis são padronizados. Use a pontuação para inverter o peso de afirmações negativas, se necessário.
                        </p>
                      </div>
                    )}

                    {/* Content interstitial — narrative screen with optional testimonial and CTA */}
                    {q.type === 'content' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-300 text-xs">Texto Principal</Label>
                          <Textarea
                            value={q.settings?.body || ''}
                            onChange={(e) => updateSettings(blockIdx, 'body', e.target.value)}
                            placeholder="Explique o padrão identificado ou reforce a continuidade..."
                            className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-24"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Depoimento (opcional)</Label>
                            <Textarea
                              value={q.settings?.testimonial_text || ''}
                              onChange={(e) => updateSettings(blockIdx, 'testimonial_text', e.target.value)}
                              placeholder='"Frase de um cliente real ou fictício..."'
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs resize-none h-20"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Autor do Depoimento</Label>
                            <Input
                              value={q.settings?.testimonial_author || ''}
                              onChange={(e) => updateSettings(blockIdx, 'testimonial_author', e.target.value)}
                              placeholder="Ex: Fernanda, (31) 9****-**08"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs"
                            />
                            <Label className="text-zinc-400 text-xs pt-2 block">Texto do Botão</Label>
                            <Input
                              value={q.settings?.cta_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'cta_label', e.target.value)}
                              placeholder="Continuar →"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Comparison — two-column "before vs after" table */}
                    {q.type === 'comparison' && (
                      <div className="space-y-3 pt-1">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Rótulo da Coluna Esquerda (estado atual)</Label>
                            <Input
                              value={q.settings?.left_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'left_label', e.target.value)}
                              placeholder="Sozinho (hoje)"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Rótulo da Coluna Direita (solução)</Label>
                            <Input
                              value={q.settings?.right_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'right_label', e.target.value)}
                              placeholder="Com a solução"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9"
                            />
                          </div>
                        </div>

                        <Label className="text-zinc-300 text-xs uppercase tracking-wider font-semibold">Linhas de Comparação</Label>
                        <div className="space-y-2">
                          {(q.settings?.rows || []).map((row, rowIdx) => (
                            <div key={rowIdx} className="grid grid-cols-[minmax(0,0.7fr)_1fr_1fr_auto] gap-2 items-center">
                              <Input value={row.label}
                                onChange={(e) => updateComparisonRow(blockIdx, rowIdx, 'label', e.target.value)}
                                placeholder="Ex: Tempo"
                                className="border-zinc-800 bg-zinc-950/70 text-zinc-400 text-xs h-9" />
                              <Input value={row.left_text}
                                onChange={(e) => updateComparisonRow(blockIdx, rowIdx, 'left_text', e.target.value)}
                                placeholder="Ex: Madrugadas perdidas"
                                className="border-red-900/40 bg-zinc-950 text-red-300 text-xs h-9" />
                              <Input value={row.right_text}
                                onChange={(e) => updateComparisonRow(blockIdx, rowIdx, 'right_text', e.target.value)}
                                placeholder="Ex: Direto ao ponto"
                                className="border-emerald-900/40 bg-zinc-950 text-emerald-300 text-xs h-9" />
                              <Button type="button" variant="ghost" size="icon"
                                disabled={(q.settings?.rows?.length ?? 0) <= 1}
                                onClick={() => removeComparisonRow(blockIdx, rowIdx)}
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => addComparisonRow(blockIdx)}
                          className="border-dashed border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800 text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                          Adicionar Linha
                        </Button>
                      </div>
                    )}

                    {/* Scarcity Timer */}
                    {q.type === 'timer' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-300 text-xs">Texto de Urgência</Label>
                          <Textarea
                            value={q.settings?.body || ''}
                            onChange={(e) => updateSettings(blockIdx, 'body', e.target.value)}
                            placeholder="Ex: Essa condição especial expira quando o tempo acabar."
                            className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-20"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Duração (minutos)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={Math.round((q.settings?.duration_seconds || 300) / 60)}
                              onChange={(e) => updateSettings(blockIdx, 'duration_seconds', Math.max(1, Number(e.target.value)) * 60)}
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Texto do Botão</Label>
                            <Input
                              value={q.settings?.cta_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'cta_label', e.target.value)}
                              placeholder="Continuar"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          A contagem recomeça do início toda vez que um visitante chega nesta etapa — não é um prazo fixo compartilhado entre visitantes.
                        </p>
                      </div>
                    )}

                    {/* Numeric Calculation */}
                    {q.type === 'numeric_calc' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Fórmula</Label>
                          <Select
                            value={q.settings?.formula || 'bmi'}
                            onValueChange={(val) => updateSettings(blockIdx, 'formula', val)}
                          >
                            <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                              <SelectItem value="bmi">IMC (peso ÷ altura²)</SelectItem>
                              <SelectItem value="difference">Diferença entre os dois valores</SelectItem>
                              <SelectItem value="none">Nenhuma (só coletar o primeiro valor)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                            <Label className="text-zinc-300 text-xs font-semibold">Campo 1</Label>
                            <Input
                              value={q.settings?.field_a_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'field_a_label', e.target.value)}
                              placeholder="Rótulo, ex: Peso (kg)"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-8"
                            />
                            <Input
                              value={q.settings?.field_a_placeholder || ''}
                              onChange={(e) => updateSettings(blockIdx, 'field_a_placeholder', e.target.value)}
                              placeholder="Exemplo, ex: 70"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-400 text-xs h-8"
                            />
                          </div>
                          <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                            <Label className="text-zinc-300 text-xs font-semibold">
                              Campo 2 {q.settings?.formula === 'none' && '(deixe vazio para ocultar)'}
                            </Label>
                            <Input
                              value={q.settings?.field_b_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'field_b_label', e.target.value)}
                              placeholder="Rótulo, ex: Altura (m)"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-8"
                            />
                            <Input
                              value={q.settings?.field_b_placeholder || ''}
                              onChange={(e) => updateSettings(blockIdx, 'field_b_placeholder', e.target.value)}
                              placeholder="Exemplo, ex: 1.75"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-400 text-xs h-8"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          O resultado calculado fica disponível como {`{{resposta_${answerablePosition}}}`} em telas posteriores.
                        </p>
                      </div>
                    )}

                    {/* Alert — highlighted warning/info/success banner */}
                    {q.type === 'alert' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Variante</Label>
                          <Select
                            value={q.settings?.alert_variant || 'warning'}
                            onValueChange={(val) => updateSettings(blockIdx, 'alert_variant', val)}
                          >
                            <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-100">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                              <SelectItem value="info">Informativo (azul)</SelectItem>
                              <SelectItem value="warning">Atenção (âmbar)</SelectItem>
                              <SelectItem value="success">Positivo (verde)</SelectItem>
                              <SelectItem value="danger">Crítico (vermelho)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-300 text-xs">Texto do Alerta</Label>
                          <Textarea
                            value={q.settings?.body || ''}
                            onChange={(e) => updateSettings(blockIdx, 'body', e.target.value)}
                            placeholder="Ex: Esse padrão de sono pode estar afetando seu metabolismo."
                            className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-20"
                          />
                        </div>
                      </div>
                    )}

                    {/* Testimonial — standalone social-proof card, can be repeated */}
                    {q.type === 'testimonial' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-300 text-xs">Depoimento</Label>
                          <Textarea
                            value={q.settings?.testimonial_text || ''}
                            onChange={(e) => updateSettings(blockIdx, 'testimonial_text', e.target.value)}
                            placeholder='"Frase de um cliente real ou fictício..."'
                            className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-20"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Autor</Label>
                            <Input
                              value={q.settings?.testimonial_author || ''}
                              onChange={(e) => updateSettings(blockIdx, 'testimonial_author', e.target.value)}
                              placeholder="Ex: Fernanda M."
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Cargo/Contexto</Label>
                            <Input
                              value={q.settings?.author_role || ''}
                              onChange={(e) => updateSettings(blockIdx, 'author_role', e.target.value)}
                              placeholder="Ex: Aluna há 3 meses"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Nota (1 a 5)</Label>
                            <Input
                              type="number" min={1} max={5}
                              value={q.settings?.rating ?? 5}
                              onChange={(e) => updateSettings(blockIdx, 'rating', Number(e.target.value))}
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">URL do Avatar (opcional)</Label>
                          <Input
                            value={q.settings?.avatar_url || ''}
                            onChange={(e) => updateSettings(blockIdx, 'avatar_url', e.target.value)}
                            placeholder="https://..."
                            className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* Social Proof — floating "fulano acabou de comprar" notification */}
                    {q.type === 'social_proof' && (
                      <div className="space-y-3 pt-1">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Nome</Label>
                            <Input
                              value={q.settings?.notification_name || ''}
                              onChange={(e) => updateSettings(blockIdx, 'notification_name', e.target.value)}
                              placeholder="Ex: Maria S."
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Ação</Label>
                            <Input
                              value={q.settings?.notification_action || ''}
                              onChange={(e) => updateSettings(blockIdx, 'notification_action', e.target.value)}
                              placeholder="Ex: acabou de garantir sua vaga"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Tempo</Label>
                            <Input
                              value={q.settings?.notification_time_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'notification_time_label', e.target.value)}
                              placeholder="Ex: há 2 minutos"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Aparece como um popup flutuante no canto da tela enquanto esta etapa estiver visível, simulando atividade recente de outros usuários.
                        </p>
                      </div>
                    )}

                    {/* Button — standalone CTA, doesn't capture an answer */}
                    {q.type === 'button' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-300 text-xs">Texto de Apoio (opcional)</Label>
                          <Textarea
                            value={q.settings?.body || ''}
                            onChange={(e) => updateSettings(blockIdx, 'body', e.target.value)}
                            placeholder="Texto acima do botão, se necessário."
                            className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-16"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Texto do Botão</Label>
                            <Input
                              value={q.settings?.cta_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'cta_label', e.target.value)}
                              placeholder="Continuar"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Link Externo (opcional)</Label>
                            <Input
                              value={q.settings?.button_url || ''}
                              onChange={(e) => updateSettings(blockIdx, 'button_url', e.target.value)}
                              placeholder="Deixe vazio para ir à próxima etapa"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9 font-mono"
                            />
                          </div>
                        </div>
                        {q.settings?.button_url && (
                          <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={q.settings?.button_open_new_tab ?? false}
                              onChange={(e) => updateSettings(blockIdx, 'button_open_new_tab', e.target.checked)}
                              className="rounded border-zinc-700 bg-zinc-950"
                            />
                            Abrir em nova aba
                          </label>
                        )}
                      </div>
                    )}

                    {/* Spacer — pure layout gap, no visible content */}
                    {q.type === 'spacer' && (
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-zinc-400 text-xs">Altura (px)</Label>
                        <Input
                          type="number" min={4} max={200}
                          value={q.settings?.duration_seconds ?? 24}
                          onChange={(e) => updateSettings(blockIdx, 'duration_seconds', Number(e.target.value))}
                          className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9 w-32"
                        />
                        <p className="text-[11px] text-zinc-500">
                          Use para dar respiro entre outros blocos empilhados nesta mesma etapa.
                        </p>
                      </div>
                    )}

                    {/* Chart — simple bar chart to display a statistic */}
                    {q.type === 'chart' && (
                      <div className="space-y-3 pt-1">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-2 space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Texto de Apoio (opcional)</Label>
                            <Input
                              value={q.settings?.body || ''}
                              onChange={(e) => updateSettings(blockIdx, 'body', e.target.value)}
                              placeholder="Ex: Baseado em 12.000 respostas"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Unidade</Label>
                            <Input
                              value={q.settings?.chart_unit || ''}
                              onChange={(e) => updateSettings(blockIdx, 'chart_unit', e.target.value)}
                              placeholder="%"
                              className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs h-9"
                            />
                          </div>
                        </div>
                        <Label className="text-zinc-300 text-xs uppercase tracking-wider font-semibold">Barras</Label>
                        <div className="space-y-2">
                          {(q.settings?.chart_bars || []).map((bar, barIdx) => (
                            <div key={barIdx} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
                              <Input value={bar.label}
                                onChange={(e) => updateChartBar(blockIdx, barIdx, 'label', e.target.value)}
                                placeholder="Ex: Pessoas como você"
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9" />
                              <Input type="number" value={bar.value}
                                onChange={(e) => updateChartBar(blockIdx, barIdx, 'value', e.target.value)}
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9 text-center" />
                              <Button type="button" variant="ghost" size="icon"
                                disabled={(q.settings?.chart_bars?.length ?? 0) <= 1}
                                onClick={() => removeChartBar(blockIdx, barIdx)}
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => addChartBar(blockIdx)}
                          className="border-dashed border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800 text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                          Adicionar Barra
                        </Button>
                      </div>
                    )}

                    {/* Quadrant — cartesian X/Y plot to position the user in a profile */}
                    {q.type === 'quadrant' && (
                      <div className="space-y-3 pt-1">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Rótulo do Eixo X</Label>
                            <Input
                              value={q.settings?.quadrant_x_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'quadrant_x_label', e.target.value)}
                              placeholder="Ex: Introvertido → Extrovertido"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-zinc-400 text-xs">Rótulo do Eixo Y</Label>
                            <Input
                              value={q.settings?.quadrant_y_label || ''}
                              onChange={(e) => updateSettings(blockIdx, 'quadrant_y_label', e.target.value)}
                              placeholder="Ex: Reativo → Estratégico"
                              className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9"
                            />
                          </div>
                        </div>
                        <Label className="text-zinc-300 text-xs uppercase tracking-wider font-semibold">Pontos no Plano</Label>
                        <div className="space-y-2">
                          {(q.settings?.quadrant_points || []).map((point, pointIdx) => (
                            <div key={pointIdx} className="grid grid-cols-[1fr_70px_70px_auto_auto] gap-2 items-center">
                              <Input value={point.label}
                                onChange={(e) => updateQuadrantPoint(blockIdx, pointIdx, 'label', e.target.value)}
                                placeholder="Ex: Você"
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9" />
                              <Input type="number" min={0} max={100} value={point.x}
                                onChange={(e) => updateQuadrantPoint(blockIdx, pointIdx, 'x', Number(e.target.value))}
                                title="Posição X (0-100)"
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9 text-center" />
                              <Input type="number" min={0} max={100} value={point.y}
                                onChange={(e) => updateQuadrantPoint(blockIdx, pointIdx, 'y', Number(e.target.value))}
                                title="Posição Y (0-100)"
                                className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9 text-center" />
                              <label className="flex items-center justify-center" title="Destacar este ponto">
                                <input
                                  type="checkbox"
                                  checked={point.highlighted ?? false}
                                  onChange={(e) => updateQuadrantPoint(blockIdx, pointIdx, 'highlighted', e.target.checked)}
                                  className="rounded border-zinc-700 bg-zinc-950"
                                />
                              </label>
                              <Button type="button" variant="ghost" size="icon"
                                disabled={(q.settings?.quadrant_points?.length ?? 0) <= 1}
                                onClick={() => removeQuadrantPoint(blockIdx, pointIdx)}
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => addQuadrantPoint(blockIdx)}
                          className="border-dashed border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800 text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                          Adicionar Ponto
                        </Button>
                        <p className="text-[11px] text-zinc-500">
                          Posições vão de 0 a 100 nos dois eixos. Marque a caixa para destacar o ponto que representa o usuário atual.
                        </p>
                      </div>
                    )}

                    {/* Audio — embedded audio player */}
                    {q.type === 'audio' && (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">URL do Áudio (mp3)</Label>
                          <Input
                            value={q.settings?.audio_url || ''}
                            onChange={(e) => updateSettings(blockIdx, 'audio_url', e.target.value)}
                            placeholder="https://..."
                            className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9 font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs">Texto de Apoio (opcional)</Label>
                          <Textarea
                            value={q.settings?.body || ''}
                            onChange={(e) => updateSettings(blockIdx, 'body', e.target.value)}
                            placeholder="Ex: Ouça o recado da nossa especialista sobre o seu resultado."
                            className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-16"
                          />
                        </div>
                      </div>
                    )}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
