'use client'

import { Users, Eye, Play, CheckCircle2, TrendingDown, ArrowDownRight, Globe2, Smartphone, Tablet, Monitor, ListChecks } from 'lucide-react'

interface DropoffData {
  question_order: number
  question_title: string
  count: number
}

interface UtmData {
  source: string
  count: number
}

interface DeviceData {
  device: string
  count: number
}

interface ResponseOption {
  option_text: string
  count: number
}

interface QuestionResponses {
  question_title: string
  options: ResponseOption[]
}

interface FunnelProps {
  views: number
  starts: number
  completions: number
  leads: number
  dropoffByQuestion: DropoffData[]
  utmBreakdown?: UtmData[]
  deviceBreakdown?: DeviceData[]
  responsesByQuestion?: QuestionResponses[]
}

const DEVICE_ICONS: Record<string, typeof Smartphone> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Celular',
  tablet: 'Tablet',
  desktop: 'Desktop',
}

export function FunnelChart({
  views, starts, completions, leads, dropoffByQuestion,
  utmBreakdown = [], deviceBreakdown = [], responsesByQuestion = [],
}: FunnelProps) {
  const max = Math.max(views, 1)

  const stages = [
    {
      label: 'Visualizações',
      value: views,
      icon: Eye,
      color: 'from-zinc-600 to-zinc-500',
      bg: 'bg-zinc-500/10 border-zinc-500/20',
      text: 'text-zinc-300',
    },
    {
      label: 'Iniciaram',
      value: starts,
      icon: Play,
      color: 'from-indigo-600 to-indigo-500',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
      text: 'text-indigo-300',
    },
    {
      label: 'Concluíram',
      value: completions,
      icon: CheckCircle2,
      color: 'from-cyan-600 to-cyan-500',
      bg: 'bg-cyan-500/10 border-cyan-500/20',
      text: 'text-cyan-300',
    },
    {
      label: 'Leads Gerados',
      value: leads,
      icon: Users,
      color: 'from-emerald-600 to-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      text: 'text-emerald-300',
    },
  ]

  const conversionRate = views > 0 ? ((leads / views) * 100).toFixed(1) : '0'
  const completionRate = starts > 0 ? ((completions / starts) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* Funnel Visual */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-zinc-200">Funil de Conversão</h3>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span>Taxa geral: <strong className="text-emerald-400">{conversionRate}%</strong></span>
            <span>Conclusão: <strong className="text-cyan-400">{completionRate}%</strong></span>
          </div>
        </div>

        {stages.map((stage, idx) => {
          const pct = Math.round((stage.value / max) * 100)
          const Icon = stage.icon
          const prevValue = idx > 0 ? stages[idx - 1].value : stage.value
          const dropPct = idx > 0 && prevValue > 0
            ? (((prevValue - stage.value) / prevValue) * 100).toFixed(0)
            : null

          return (
            <div key={stage.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${stage.text}`} />
                  <span className={`font-medium ${stage.text}`}>{stage.label}</span>
                  {dropPct && Number(dropPct) > 0 && (
                    <span className="flex items-center gap-0.5 text-red-400 font-mono">
                      <ArrowDownRight className="h-3 w-3" />
                      -{dropPct}%
                    </span>
                  )}
                </div>
                <span className="font-bold text-zinc-200 tabular-nums">{stage.value.toLocaleString('pt-BR')}</span>
              </div>
              <div className="w-full h-6 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
                <div
                  className={`h-full bg-gradient-to-r ${stage.color} rounded-lg transition-all duration-700 flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                >
                  {pct > 10 && (
                    <span className="text-[11px] font-semibold text-white/80">{pct}%</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Drop-off por Pergunta */}
      {dropoffByQuestion.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <h3 className="text-base font-semibold text-zinc-200">Análise de Drop-off por Pergunta</h3>
          </div>
          <p className="text-xs text-zinc-500">
            Identifique em qual etapa os usuários estão abandonando o quiz para otimizar o fluxo.
          </p>

          <div className="space-y-3">
            {dropoffByQuestion
              .sort((a, b) => b.count - a.count)
              .map((item) => {
                const maxDropoff = Math.max(...dropoffByQuestion.map((d) => d.count), 1)
                const pct = Math.round((item.count / maxDropoff) * 100)
                const severity = pct > 66 ? 'text-red-400' : pct > 33 ? 'text-amber-400' : 'text-zinc-400'

                return (
                  <div key={item.question_order} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 truncate max-w-[240px]">
                        <span className="text-zinc-500 font-mono mr-2">Q{item.question_order + 1}</span>
                        {item.question_title}
                      </span>
                      <span className={`font-bold tabular-nums ${severity}`}>
                        {item.count} abandono{item.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-zinc-900 rounded-md overflow-hidden border border-zinc-800">
                      <div
                        className={`h-full rounded-md transition-all duration-500 ${
                          pct > 66 ? 'bg-red-500/40' : pct > 33 ? 'bg-amber-500/40' : 'bg-zinc-600/40'
                        }`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {dropoffByQuestion.length === 0 && starts === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
          <TrendingDown className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            Dados de drop-off aparecerão aqui assim que o quiz receber os primeiros visitantes.
          </p>
        </div>
      )}

      {/* Origens (UTM) e Dispositivos, lado a lado */}
      {(utmBreakdown.length > 0 || deviceBreakdown.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {utmBreakdown.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl space-y-3">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-indigo-400" />
                <h3 className="text-base font-semibold text-zinc-200">Origens (UTM)</h3>
              </div>
              <div className="space-y-2.5">
                {(() => {
                  const maxUtm = Math.max(...utmBreakdown.map((u) => u.count), 1)
                  return utmBreakdown.map((u) => (
                    <div key={u.source} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 truncate max-w-[70%]">{u.source}</span>
                        <span className="font-bold text-zinc-200 tabular-nums">{u.count}</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500"
                          style={{ width: `${Math.max(Math.round((u.count / maxUtm) * 100), 4)}%` }}
                        />
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {deviceBreakdown.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-semibold text-zinc-200">Dispositivos</h3>
              </div>
              <div className="space-y-2.5">
                {(() => {
                  const maxDevice = Math.max(...deviceBreakdown.map((d) => d.count), 1)
                  return deviceBreakdown.map((d) => {
                    const Icon = DEVICE_ICONS[d.device] || Monitor
                    return (
                      <div key={d.device} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300 flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-zinc-500" />
                            {DEVICE_LABELS[d.device] || d.device}
                          </span>
                          <span className="font-bold text-zinc-200 tabular-nums">{d.count}</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500"
                            style={{ width: `${Math.max(Math.round((d.count / maxDevice) * 100), 4)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Respostas por Pergunta */}
      {responsesByQuestion.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl space-y-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-zinc-200">Respostas por Pergunta</h3>
          </div>
          <div className="space-y-5">
            {responsesByQuestion.map((q) => {
              const totalAnswers = q.options.reduce((sum, o) => sum + o.count, 0)
              return (
                <div key={q.question_title} className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-300">{q.question_title}</p>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const pct = totalAnswers > 0 ? Math.round((opt.count / totalAnswers) * 100) : 0
                      return (
                        <div key={opt.option_text} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400 truncate max-w-[70%]">{opt.option_text}</span>
                            <span className="text-zinc-500 tabular-nums">{opt.count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
