'use client'

import { useState } from 'react'
import { Plus, Trash2, Save, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { saveResultLevels, updateQuizSettings } from '@/app/dashboard/actions'
import { ScoredResultScreen } from '@/components/player/scored-result-screen'

interface Level {
  id?: string
  name: string
  description?: string
  min_score: number
  max_score: number
  color: string
}

const DEFAULT_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e']

export function ResultLevelsTab({
  quizId,
  initialEnabled,
  initialLevels,
  initialLoadingMessages,
}: {
  quizId: string
  initialEnabled: boolean
  initialLevels: Level[]
  initialLoadingMessages: string[]
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [levels, setLevels] = useState<Level[]>(
    initialLevels.length > 0
      ? initialLevels
      : [
          { name: 'Nível Inicial', description: '', min_score: 0, max_score: 25, color: DEFAULT_COLORS[0] },
          { name: 'Nível Intermediário', description: '', min_score: 26, max_score: 60, color: DEFAULT_COLORS[1] },
          { name: 'Nível Avançado', description: '', min_score: 61, max_score: 100, color: DEFAULT_COLORS[3] },
        ]
  )
  const [loadingMessages, setLoadingMessages] = useState<string[]>(
    initialLoadingMessages.length > 0 ? initialLoadingMessages : ['Calculando seu resultado...']
  )
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const addLevel = () => {
    const lastMax = levels.length > 0 ? levels[levels.length - 1].max_score : 0
    setLevels([
      ...levels,
      {
        name: `Nível ${levels.length + 1}`,
        description: '',
        min_score: lastMax + 1,
        max_score: lastMax + 25,
        color: DEFAULT_COLORS[levels.length % DEFAULT_COLORS.length],
      },
    ])
  }

  const removeLevel = (index: number) => {
    setLevels(levels.filter((_, i) => i !== index))
  }

  const updateLevel = (index: number, field: keyof Level, value: string | number) => {
    const next = [...levels]
    next[index] = { ...next[index], [field]: value }
    setLevels(next)
  }

  const addLoadingMessage = () => {
    setLoadingMessages([...loadingMessages, ''])
  }

  const updateLoadingMessage = (index: number, value: string) => {
    const next = [...loadingMessages]
    next[index] = value
    setLoadingMessages(next)
  }

  const removeLoadingMessage = (index: number) => {
    if (loadingMessages.length <= 1) return
    setLoadingMessages(loadingMessages.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await updateQuizSettings(quizId, {
        enable_scored_result: enabled,
        loading_messages: loadingMessages.filter((m) => m.trim()),
      })
      if (enabled) {
        await saveResultLevels(quizId, levels)
      }
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      setSaveError('Erro ao salvar o resultado calculado. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Preview data for the ruler, using the current in-progress level config —
  // marker placed at the midpoint of the middle-ish level so the admin sees
  // roughly how it will look without needing to actually answer the quiz.
  const previewLevel = levels[Math.floor(levels.length / 2)]
  const previewScore = previewLevel
    ? Math.round((previewLevel.min_score + previewLevel.max_score) / 2)
    : 0

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Resultado Calculado</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Dê pontos a cada opção de resposta na aba Perguntas, defina faixas de pontuação aqui, e o
            visitante recebe um nível personalizado ao final — como um diagnóstico, não só um &quot;obrigado&quot;.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
          {savedSuccess && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <Check className="h-4 w-4" /> Salvo!
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="rounded-2xl border border-border bg-card p-5 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <Label className="text-foreground font-medium">Ativar Resultado Calculado</Label>
            <p className="text-xs text-muted-foreground">
              Depois de capturar o lead, mostra uma tela de &quot;processando&quot; seguida do nível atingido.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <>
          {/* Levels */}
          <div className="rounded-2xl border border-border bg-card p-5 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                Níveis do Resultado (a régua)
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              As faixas de pontuação devem cobrir do menor ao maior score possível, sem sobreposição — a
              soma dos pontos das respostas de cada visitante cai em uma dessas faixas.
            </p>

            <div className="space-y-3">
              {levels.map((level, index) => (
                <div key={index} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={level.color}
                      onChange={(e) => updateLevel(index, 'color', e.target.value)}
                      className="h-9 w-9 rounded-md border border-border bg-muted/50 shrink-0 cursor-pointer"
                      title="Cor do nível"
                    />
                    <Input
                      value={level.name}
                      onChange={(e) => updateLevel(index, 'name', e.target.value)}
                      placeholder="Nome do nível, ex: Iniciante"
                      className="border-border bg-muted/50 text-foreground text-sm h-9 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={levels.length <= 1}
                      onClick={() => removeLevel(index)}
                      className="h-9 w-9 text-muted-foreground hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-[11px]">Pontuação mínima</Label>
                      <Input
                        type="number"
                        value={level.min_score}
                        onChange={(e) => updateLevel(index, 'min_score', Number(e.target.value))}
                        className="border-border bg-muted/50 text-foreground text-sm h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-[11px]">Pontuação máxima</Label>
                      <Input
                        type="number"
                        value={level.max_score}
                        onChange={(e) => updateLevel(index, 'max_score', Number(e.target.value))}
                        className="border-border bg-muted/50 text-foreground text-sm h-9"
                      />
                    </div>
                  </div>
                  <Textarea
                    value={level.description || ''}
                    onChange={(e) => updateLevel(index, 'description', e.target.value)}
                    placeholder="Texto explicando o que esse nível significa para o visitante..."
                    className="border-border bg-muted/50 text-muted-foreground text-xs resize-none h-16"
                  />
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLevel}
              className="border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-accent text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
              Adicionar Nível
            </Button>
          </div>

          {/* Loading messages */}
          <div className="rounded-2xl border border-border bg-card p-5 backdrop-blur-xl space-y-4">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Mensagens da Tela de Processamento
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Aparecem em sequência, uma de cada vez, entre o envio do formulário e a revelação do
              resultado — reforça a sensação de que a resposta foi calculada, não só exibida.
            </p>
            <div className="space-y-2">
              {loadingMessages.map((msg, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono w-4">{index + 1}</span>
                  <Input
                    value={msg}
                    onChange={(e) => updateLoadingMessage(index, e.target.value)}
                    placeholder="Ex: Cruzando suas respostas..."
                    className="border-border bg-muted/50 text-foreground text-sm h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={loadingMessages.length <= 1}
                    onClick={() => removeLoadingMessage(index)}
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLoadingMessage}
              className="border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-accent text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
              Adicionar Mensagem
            </Button>
          </div>

          {/* Live preview */}
          {previewLevel && levels.every((l) => l.name.trim()) && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                Pré-visualização
              </Label>
              <div className="bg-muted/50 rounded-2xl p-6">
                <ScoredResultScreen
                  result={{
                    score: previewScore,
                    levelName: previewLevel.name,
                    levelDescription: previewLevel.description || null,
                    levelColor: previewLevel.color,
                    allLevels: levels.map((l) => ({
                      name: l.name,
                      minScore: l.min_score,
                      maxScore: l.max_score,
                      color: l.color,
                    })),
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
