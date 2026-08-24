'use client'

import { useState } from 'react'
import { Activity, ArrowDownRight, CheckCircle2, ChevronDown, Eye, Globe2, MousePointer2, Smartphone, UsersRound } from 'lucide-react'
import type { FunnelAnalyticsData } from './types'

interface AnalyticsViewProps {
  analytics: FunnelAnalyticsData
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value) + '%'
}

export function AnalyticsView({ analytics }: AnalyticsViewProps) {
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null)
  const maxDaily = Math.max(1, ...analytics.daily.map((day) => day.starts))
  const maxPageVisits = Math.max(1, ...analytics.pageAnalytics.map((page) => page.visits))
  const maxUtmStarts = Math.max(1, ...analytics.utmSources.map((entry) => entry.starts))
  const maxDeviceStarts = Math.max(1, ...analytics.devices.map((entry) => entry.starts))

  const cards = [
    { label: 'Visitas', value: formatNumber(analytics.visits), icon: Eye, tone: 'text-cyan-600 bg-cyan-400/10 border-cyan-400/10' },
    { label: 'Inícios', value: formatNumber(analytics.starts), icon: UsersRound, tone: 'text-violet-600 bg-violet-400/10 border-violet-400/10' },
    { label: 'Conclusões', value: formatNumber(analytics.completions), icon: CheckCircle2, tone: 'text-emerald-500 bg-emerald-400/10 border-emerald-400/10' },
    { label: 'Conversão por início', value: formatPercent(analytics.conversionRate), icon: MousePointer2, tone: 'text-fuchsia-600 bg-fuchsia-400/10 border-fuchsia-400/10' },
    { label: 'Abandono estimado', value: formatNumber(analytics.abandonments), icon: ArrowDownRight, tone: 'text-amber-600 bg-amber-400/10 border-amber-400/10' },
  ]

  return (
    <div className="space-y-5">
      {analytics.sampled && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-700">
          O volume excede a janela de análise detalhada. Os totais são exatos; gráficos e abandono por página usam os eventos mais recentes.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className={`grid size-9 place-items-center rounded-xl border ${tone}`}>
              <Icon className="size-4" />
            </div>
            <p className="mt-5 text-2xl font-extrabold tracking-[-0.04em] text-foreground">{value}</p>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground/50">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">Atividade nos últimos 14 dias</p>
              <p className="mt-1 text-xs text-muted-foreground/50">Primeiras interações e conclusões registradas.</p>
            </div>
            <span className="grid size-9 place-items-center rounded-xl border border-border bg-muted/30 text-violet-600">
              <Activity className="size-4" />
            </span>
          </div>

          <div className="mt-8 flex h-56 items-end gap-1.5 sm:gap-2.5">
            {analytics.daily.map((day) => {
              const startHeight = day.starts === 0 ? 2 : Math.max(8, (day.starts / maxDaily) * 100)
              const completionHeight = day.completions === 0 ? 1 : Math.max(5, (day.completions / maxDaily) * 100)
              return (
                <div key={day.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div className="relative flex h-[180px] items-end justify-center gap-0.5 rounded-md bg-muted/20 px-0.5">
                    <span
                      className="w-[44%] rounded-t bg-gradient-to-t from-violet-700 to-violet-400 transition group-hover:brightness-125"
                      style={{ height: `${startHeight}%` }}
                      title={`${day.starts} inícios`}
                    />
                    <span
                      className="w-[32%] rounded-t bg-gradient-to-t from-cyan-600 to-cyan-300 transition group-hover:brightness-125"
                      style={{ height: `${completionHeight}%` }}
                      title={`${day.completions} conclusões`}
                    />
                  </div>
                  <span className="mt-2 truncate text-center text-[9px] text-muted-foreground/60">{day.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex items-center justify-center gap-5 border-t border-border pt-4 text-[10px] font-medium text-muted-foreground/50">
            <span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-violet-400" /> Inícios</span>
            <span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-cyan-300" /> Conclusões</span>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-sm font-bold text-foreground">Resumo da jornada</p>
          <p className="mt-1 text-xs text-muted-foreground/50">Passagem entre as principais etapas do funil.</p>
          <div className="mt-7 space-y-4">
            <FunnelBar label="Visitas" value={analytics.visits} total={Math.max(analytics.visits, 1)} color="from-violet-600 to-indigo-400" />
            <FunnelBar label="Inícios por interação" value={analytics.starts} total={Math.max(analytics.visits, analytics.starts, 1)} color="from-indigo-600 to-cyan-400" />
            <FunnelBar label="Conclusões" value={analytics.completions} total={Math.max(analytics.visits, analytics.starts, 1)} color="from-cyan-600 to-emerald-400" />
          </div>
          <div className="mt-7 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50">Critério de abandono</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Inícios sem conclusão, encerrados ou inativos há pelo menos 30 minutos.
              A abertura conta como visita; o início só acontece na primeira interação.
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BreakdownCard
          title="Origem (UTM)"
          description="Inícios por utm_source, com conversão de cada origem."
          icon={Globe2}
          entries={analytics.utmSources}
          maxStarts={maxUtmStarts}
        />
        <BreakdownCard
          title="Dispositivo"
          description="Inícios por tipo de tela, com conversão de cada um."
          icon={Smartphone}
          entries={analytics.devices}
          maxStarts={maxDeviceStarts}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5 sm:p-6">
          <p className="text-sm font-bold text-foreground">Abandono por página</p>
          <p className="mt-1 text-xs text-muted-foreground/50">Última página dos inícios que não chegaram à conclusão. Páginas com campos expandem o detalhe por campo.</p>
        </div>

        {analytics.pageAnalytics.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground/50">
            Nenhuma página encontrada neste funil.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {analytics.pageAnalytics.map((page, index) => {
              const expandable = page.elementAnalytics.length > 0
              const expanded = expandedPageId === page.id
              return (
                <div key={page.id}>
                  <button
                    type="button"
                    onClick={() => expandable && setExpandedPageId(expanded ? null : page.id)}
                    disabled={!expandable}
                    className={`grid w-full gap-4 px-5 py-4 text-left sm:grid-cols-[minmax(180px,0.8fr)_minmax(240px,1.7fr)_110px_28px] sm:items-center sm:px-6 ${expandable ? 'cursor-pointer transition hover:bg-accent' : 'cursor-default'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/30 font-mono text-[10px] text-muted-foreground/50">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-muted-foreground">{page.name}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/60">{formatNumber(page.visits)} visitas únicas</p>
                      </div>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-400 to-cyan-300"
                        style={{ width: `${page.visits === 0 ? 0 : Math.max(2, (page.visits / maxPageVisits) * 100)}%` }}
                      />
                    </div>

                    <div className="sm:text-right">
                      <p className="text-xs font-bold text-muted-foreground">{formatPercent(page.abandonmentRate)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">{page.abandonments} abandonos</p>
                    </div>

                    <span className={`hidden size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 sm:flex ${expandable ? '' : 'opacity-0'}`}>
                      <ChevronDown className={`size-4 transition ${expanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  {expandable && expanded && (
                    <div className="border-t border-border bg-muted/20 px-5 py-3 sm:px-6">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50">Abandono por campo</p>
                      <div className="space-y-1.5">
                        {page.elementAnalytics.map((element) => (
                          <div key={element.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                            <span className="min-w-0 truncate text-muted-foreground">{element.label}</span>
                            <span className="flex shrink-0 items-center gap-3 font-mono text-[10px] text-muted-foreground">
                              <span>{element.interactions} interações</span>
                              {element.abandonments > 0 && <span className="text-amber-600/80">{element.abandonments} abandonos aqui</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function BreakdownCard({
  title,
  description,
  icon: Icon,
  entries,
  maxStarts,
}: {
  title: string
  description: string
  icon: typeof Globe2
  entries: FunnelAnalyticsData['utmSources']
  maxStarts: number
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground/50">{description}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/30 text-violet-600">
          <Icon className="size-4" />
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="mt-6 text-xs text-muted-foreground/60">Sem inícios registrados ainda.</p>
      ) : (
        <div className="mt-6 space-y-3.5">
          {entries.map((entry) => (
            <div key={entry.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">{entry.key}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">{formatNumber(entry.starts)} · {formatPercent(entry.conversionRate)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-400 to-cyan-300"
                  style={{ width: `${Math.max(2, (entry.starts / maxStarts) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = value === 0 ? 0 : Math.max(4, Math.min(100, (value / total) * 100))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold text-muted-foreground">{formatNumber(value)}</span>
      </div>
      <div className="h-9 overflow-hidden rounded-lg bg-muted/40">
        <div className={`h-full rounded-lg bg-gradient-to-r ${color} opacity-80`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
