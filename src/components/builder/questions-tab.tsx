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
}

interface Question {
  id?: string
  title: string
  description?: string
  type: string
  order_num: number
  options?: Option[]
  branching_rules?: BranchingRule[]
  settings?: QuestionSettings
}

const LIKERT_OPTIONS = [
  'Concordo totalmente',
  'Concordo parcialmente',
  'Neutro',
  'Discordo parcialmente',
  'Discordo totalmente',
]

export function QuestionsTab({
  quizId,
  initialQuestions,
  scoringEnabled = false,
}: {
  quizId: string
  initialQuestions: Question[]
  scoringEnabled?: boolean
}) {
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions.length > 0
      ? initialQuestions
      : [
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
            branching_rules: [],
          },
        ]
  )

  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [expandedBranching, setExpandedBranching] = useState<number | null>(null)

  const addQuestion = (type: string = 'multiple_choice') => {
    const newQ: Question = {
      title: type === 'content' ? 'Título do interstício' : type === 'comparison' ? 'O que muda com a solução' : 'Nova Pergunta',
      description: '',
      type,
      order_num: questions.length,
      options:
        type === 'multiple_choice' || type === 'image_choice'
          ? [
              { text: 'Opção 1', order_num: 0 },
              { text: 'Opção 2', order_num: 1 },
            ]
          : type === 'likert'
          ? LIKERT_OPTIONS.map((text, order_num) => ({ text, order_num }))
          : [],
      branching_rules: [],
      settings:
        type === 'content'
          ? { body: '', testimonial_text: '', testimonial_author: '', cta_label: 'Continuar' }
          : type === 'comparison'
          ? {
              left_label: 'Sozinho (hoje)',
              right_label: 'Com a solução',
              rows: [{ label: 'Resultado', left_text: '', right_text: '' }],
            }
          : {},
    }
    setQuestions([...questions, newQ])
  }

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === questions.length - 1)) return
    const next = [...questions]
    const target = direction === 'up' ? index - 1 : index + 1
    ;[next[index], next[target]] = [next[target], next[index]]
    setQuestions(next)
  }

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const next = [...questions]
    next[index] = { ...next[index], [field]: value }
    if (field === 'type') {
      const needsOptions = value === 'multiple_choice' || value === 'image_choice'
      if (needsOptions && !next[index].options?.length) {
        next[index].options = [
          { text: 'Opção 1', order_num: 0 },
          { text: 'Opção 2', order_num: 1 },
        ]
      } else if (value === 'likert' && !next[index].options?.length) {
        next[index].options = LIKERT_OPTIONS.map((text, order_num) => ({ text, order_num }))
      } else if (value === 'content' && !next[index].settings?.body) {
        next[index].settings = {
          ...next[index].settings,
          body: next[index].settings?.body || '',
          cta_label: next[index].settings?.cta_label || 'Continuar',
        }
      } else if (value === 'comparison' && !next[index].settings?.rows?.length) {
        next[index].settings = {
          left_label: 'Sozinho (hoje)',
          right_label: 'Com a solução',
          rows: [{ label: 'Resultado', left_text: '', right_text: '' }],
        }
      }
    }
    setQuestions(next)
  }

  const updateSettings = (qIdx: number, field: keyof QuestionSettings, value: any) => {
    const next = [...questions]
    next[qIdx].settings = { ...next[qIdx].settings, [field]: value }
    setQuestions(next)
  }

  const addComparisonRow = (qIdx: number) => {
    const next = [...questions]
    const rows = next[qIdx].settings?.rows || []
    next[qIdx].settings = {
      ...next[qIdx].settings,
      rows: [...rows, { label: '', left_text: '', right_text: '' }],
    }
    setQuestions(next)
  }

  const updateComparisonRow = (qIdx: number, rowIdx: number, field: keyof ComparisonRow, value: string) => {
    const next = [...questions]
    const rows = [...(next[qIdx].settings?.rows || [])]
    rows[rowIdx] = { ...rows[rowIdx], [field]: value }
    next[qIdx].settings = { ...next[qIdx].settings, rows }
    setQuestions(next)
  }

  const removeComparisonRow = (qIdx: number, rowIdx: number) => {
    const next = [...questions]
    const rows = (next[qIdx].settings?.rows || []).filter((_, i) => i !== rowIdx)
    next[qIdx].settings = { ...next[qIdx].settings, rows }
    setQuestions(next)
  }

  const addOption = (qIdx: number) => {
    const next = [...questions]
    const opts = next[qIdx].options || []
    next[qIdx].options = [...opts, { text: `Opção ${opts.length + 1}`, order_num: opts.length }]
    setQuestions(next)
  }

  const updateOption = (qIdx: number, optIdx: number, text: string) => {
    const next = [...questions]
    if (next[qIdx].options) {
      next[qIdx].options![optIdx].text = text
      setQuestions(next)
    }
  }

  const updateOptionImage = (qIdx: number, optIdx: number, imageUrl: string) => {
    const next = [...questions]
    if (next[qIdx].options) {
      next[qIdx].options![optIdx].image_url = imageUrl
      setQuestions(next)
    }
  }

  const updateOptionScore = (qIdx: number, optIdx: number, scoreValue: number) => {
    const next = [...questions]
    if (next[qIdx].options) {
      next[qIdx].options![optIdx].score_value = scoreValue
      setQuestions(next)
    }
  }

  const removeOption = (qIdx: number, optIdx: number) => {
    const next = [...questions]
    if (next[qIdx].options) {
      next[qIdx].options = next[qIdx].options!.filter((_, i) => i !== optIdx)
      // Remove branching rules referencing removed option
      const removedOpt = questions[qIdx].options?.[optIdx]
      if (removedOpt?.id && next[qIdx].branching_rules) {
        next[qIdx].branching_rules = next[qIdx].branching_rules!.filter(
          (r) => r.option_id !== removedOpt.id
        )
      }
      setQuestions(next)
    }
  }

  // Branching helpers
  const addBranchingRule = (qIdx: number) => {
    const next = [...questions]
    const rules = next[qIdx].branching_rules || []
    next[qIdx].branching_rules = [...rules, { option_id: '', go_to_order: qIdx + 2 }]
    setQuestions(next)
  }

  const updateBranchingRule = (qIdx: number, rIdx: number, field: 'option_id' | 'go_to_order', value: any) => {
    const next = [...questions]
    const rules = [...(next[qIdx].branching_rules || [])]
    rules[rIdx] = { ...rules[rIdx], [field]: field === 'go_to_order' ? Number(value) : value }
    next[qIdx].branching_rules = rules
    setQuestions(next)
  }

  const removeBranchingRule = (qIdx: number, rIdx: number) => {
    const next = [...questions]
    next[qIdx].branching_rules = (next[qIdx].branching_rules || []).filter((_, i) => i !== rIdx)
    setQuestions(next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveQuestions(quizId, questions)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar perguntas.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Etapas & Perguntas</h2>
          <p className="text-zinc-400 text-xs mt-0.5">
            Monte o fluxo do quiz. Use as regras de ramificação para criar caminhos personalizados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="h-4 w-4" /> Perguntas salvas!
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, qIndex) => (
          <div key={qIndex} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center">
                  {qIndex + 1}
                </span>
                <span className="text-sm font-semibold text-zinc-300">
                  {q.type === 'multiple_choice' && 'Múltipla Escolha'}
                  {q.type === 'text' && 'Resposta Aberta'}
                  {q.type === 'scale' && 'Escala (1 a 5)'}
                  {q.type === 'image_choice' && 'Opções com Imagem'}
                  {q.type === 'likert' && 'Escala de Concordância'}
                  {q.type === 'content' && 'Interstício (Conteúdo)'}
                  {q.type === 'comparison' && 'Comparativo'}
                </span>
                {(q.branching_rules?.length ?? 0) > 0 && (
                  <Badge className="bg-purple-500/10 border-purple-500/20 text-purple-400 text-[11px]">
                    <GitBranch className="h-3 w-3 mr-1" />
                    {q.branching_rules!.length} regra(s)
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" disabled={qIndex === 0}
                  onClick={() => moveQuestion(qIndex, 'up')}
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={qIndex === questions.length - 1}
                  onClick={() => moveQuestion(qIndex, 'down')}
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => removeQuestion(qIndex)}
                  className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-zinc-800">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Title + Type */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-zinc-300 text-xs">Título da Pergunta</Label>
                <Input value={q.title}
                  onChange={(e) => updateQuestion(qIndex, 'title', e.target.value)}
                  placeholder="Enunciado da pergunta"
                  className="border-zinc-700 bg-zinc-950 text-zinc-100 font-medium" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-xs">Tipo</Label>
                <Select value={q.type} onValueChange={(val) => updateQuestion(qIndex, 'type', val)}>
                  <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <SelectItem value="multiple_choice">Múltipla Escolha</SelectItem>
                    <SelectItem value="image_choice">Opções com Imagem</SelectItem>
                    <SelectItem value="text">Texto Livre</SelectItem>
                    <SelectItem value="scale">Escala (1 a 5)</SelectItem>
                    <SelectItem value="likert">Escala de Concordância</SelectItem>
                    <SelectItem value="content">Interstício (Conteúdo)</SelectItem>
                    <SelectItem value="comparison">Comparativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {q.type !== 'content' && q.type !== 'comparison' && (
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Descrição ou Subtítulo (opcional)</Label>
                <Input value={q.description || ''}
                  onChange={(e) => updateQuestion(qIndex, 'description', e.target.value)}
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
                        onChange={(e) => updateOptionImage(qIndex, optIndex, e.target.value)}
                        placeholder="URL da imagem"
                        className="border-zinc-800 bg-zinc-950 text-zinc-100 text-xs h-9 w-32 shrink-0 font-mono" />
                    )}
                    <Input value={opt.text}
                      onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                      placeholder={`Opção ${optIndex + 1}`}
                      className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9" />
                    {scoringEnabled && (
                      <Input
                        type="number"
                        value={opt.score_value ?? 0}
                        onChange={(e) => updateOptionScore(qIndex, optIndex, Number(e.target.value))}
                        className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9 w-16 text-center shrink-0"
                        title="Pontos que esta opção soma ao resultado final"
                      />
                    )}
                    <Button type="button" variant="ghost" size="icon"
                      disabled={q.options!.length <= 1}
                      onClick={() => removeOption(qIndex, optIndex)}
                      className="h-8 w-8 text-zinc-500 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm"
                  onClick={() => addOption(qIndex)}
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
                          onChange={(e) => updateOptionScore(qIndex, optIndex, Number(e.target.value))}
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
                    onChange={(e) => updateSettings(qIndex, 'body', e.target.value)}
                    placeholder="Explique o padrão identificado ou reforce a continuidade..."
                    className="border-zinc-800 bg-zinc-950 text-zinc-200 text-sm resize-none h-24"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Depoimento (opcional)</Label>
                    <Textarea
                      value={q.settings?.testimonial_text || ''}
                      onChange={(e) => updateSettings(qIndex, 'testimonial_text', e.target.value)}
                      placeholder='"Frase de um cliente real ou fictício..."'
                      className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs resize-none h-20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Autor do Depoimento</Label>
                    <Input
                      value={q.settings?.testimonial_author || ''}
                      onChange={(e) => updateSettings(qIndex, 'testimonial_author', e.target.value)}
                      placeholder="Ex: Fernanda, (31) 9****-**08"
                      className="border-zinc-800 bg-zinc-950/70 text-zinc-300 text-xs"
                    />
                    <Label className="text-zinc-400 text-xs pt-2 block">Texto do Botão</Label>
                    <Input
                      value={q.settings?.cta_label || ''}
                      onChange={(e) => updateSettings(qIndex, 'cta_label', e.target.value)}
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
                      onChange={(e) => updateSettings(qIndex, 'left_label', e.target.value)}
                      placeholder="Sozinho (hoje)"
                      className="border-zinc-800 bg-zinc-950 text-zinc-100 text-sm h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">Rótulo da Coluna Direita (solução)</Label>
                    <Input
                      value={q.settings?.right_label || ''}
                      onChange={(e) => updateSettings(qIndex, 'right_label', e.target.value)}
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
                        onChange={(e) => updateComparisonRow(qIndex, rowIdx, 'label', e.target.value)}
                        placeholder="Ex: Tempo"
                        className="border-zinc-800 bg-zinc-950/70 text-zinc-400 text-xs h-9" />
                      <Input value={row.left_text}
                        onChange={(e) => updateComparisonRow(qIndex, rowIdx, 'left_text', e.target.value)}
                        placeholder="Ex: Madrugadas perdidas"
                        className="border-red-900/40 bg-zinc-950 text-red-300 text-xs h-9" />
                      <Input value={row.right_text}
                        onChange={(e) => updateComparisonRow(qIndex, rowIdx, 'right_text', e.target.value)}
                        placeholder="Ex: Direto ao ponto"
                        className="border-emerald-900/40 bg-zinc-950 text-emerald-300 text-xs h-9" />
                      <Button type="button" variant="ghost" size="icon"
                        disabled={(q.settings?.rows?.length ?? 0) <= 1}
                        onClick={() => removeComparisonRow(qIndex, rowIdx)}
                        className="h-8 w-8 text-zinc-500 hover:text-red-400 shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => addComparisonRow(qIndex)}
                  className="border-dashed border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                  Adicionar Linha
                </Button>
              </div>
            )}

            {/* ─── Branching Rules Panel ─── */}
            {q.type === 'multiple_choice' && questions.length > 1 && (
              <div className="border-t border-zinc-800/60 pt-4 mt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => setExpandedBranching(expandedBranching === qIndex ? null : qIndex)}
                  className="flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Lógica Condicional (Ramificação)
                  <span className="text-zinc-500 font-normal ml-1">
                    — SE resposta X, IR para pergunta Y
                  </span>
                </button>

                {expandedBranching === qIndex && (
                  <div className="space-y-2 bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-4">
                    <p className="text-[11px] text-zinc-500">
                      Defina para onde o usuário deve ser enviado dependendo da resposta escolhida. Sem regra = próxima pergunta em sequência.
                    </p>

                    {(q.branching_rules || []).map((rule, rIdx) => (
                      <div key={rIdx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 py-2 border-b border-zinc-800/40 last:border-0">
                        <span className="text-[11px] text-zinc-500 uppercase font-semibold w-6">SE</span>
                        <Select
                          value={rule.option_id}
                          onValueChange={(val) => updateBranchingRule(qIndex, rIdx, 'option_id', val)}
                        >
                          <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-200 text-xs h-8 flex-1">
                            <SelectValue placeholder="Escolher opção..." />
                          </SelectTrigger>
                          <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                            {q.options?.map((opt, oi) => (
                              <SelectItem key={oi} value={opt.id || `opt-${oi}`}>
                                {String.fromCharCode(65 + oi)}: {opt.text}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-[11px] text-zinc-500 uppercase font-semibold">IR PARA</span>
                        <Select
                          value={String(rule.go_to_order)}
                          onValueChange={(val) => updateBranchingRule(qIndex, rIdx, 'go_to_order', val)}
                        >
                          <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-200 text-xs h-8 flex-1">
                            <SelectValue placeholder="Pergunta destino..." />
                          </SelectTrigger>
                          <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                            {questions
                              .filter((_, i) => i !== qIndex)
                              .map((destQ, di) => (
                                <SelectItem key={di} value={String(destQ.order_num)}>
                                  Pergunta {destQ.order_num + 1}: {destQ.title.slice(0, 40)}…
                                </SelectItem>
                              ))}
                            <SelectItem value={String(questions.length)}>
                              → Captura de Lead (Final)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon"
                          onClick={() => removeBranchingRule(qIndex, rIdx)}
                          className="h-8 w-8 text-zinc-500 hover:text-red-400 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}

                    <Button type="button" variant="outline" size="sm"
                      onClick={() => addBranchingRule(qIndex)}
                      className="border-dashed border-purple-800 bg-purple-950/20 text-purple-400 hover:bg-purple-900/20 text-xs mt-1">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar Regra de Ramificação
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Block Bar */}
      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-6 text-center space-y-4">
        <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Adicionar Bloco</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline"
            onClick={() => addQuestion('multiple_choice')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <ListCheck className="h-4 w-4 text-indigo-400" />
            Múltipla Escolha
          </Button>
          <Button type="button" variant="outline"
            onClick={() => addQuestion('text')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <AlignLeft className="h-4 w-4 text-cyan-400" />
            Resposta Aberta
          </Button>
          <Button type="button" variant="outline"
            onClick={() => addQuestion('scale')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <Sliders className="h-4 w-4 text-amber-400" />
            Escala (1 a 5)
          </Button>
          <Button type="button" variant="outline"
            onClick={() => addQuestion('image_choice')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <ImageIcon className="h-4 w-4 text-pink-400" />
            Opções com Imagem
          </Button>
          <Button type="button" variant="outline"
            onClick={() => addQuestion('likert')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <ListTree className="h-4 w-4 text-teal-400" />
            Escala de Concordância
          </Button>
          <Button type="button" variant="outline"
            onClick={() => addQuestion('content')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <MessageSquareQuote className="h-4 w-4 text-violet-400" />
            Interstício (Conteúdo)
          </Button>
          <Button type="button" variant="outline"
            onClick={() => addQuestion('comparison')}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white gap-2">
            <Columns2 className="h-4 w-4 text-rose-400" />
            Comparativo
          </Button>
        </div>
      </div>
    </div>
  )
}
