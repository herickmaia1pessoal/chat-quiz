import { Activity, ArrowDownRight, CheckCircle2, Eye, MousePointer2, UsersRound } from 'lucide-react'
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
  const maxDaily = Math.max(1, ...analytics.daily.map((day) => day.starts))
  const maxPageVisits = Math.max(1, ...analytics.pageAnalytics.map((page) => page.visits))

  const cards = [
    { label: 'Visitas', value: formatNumber(analytics.visits), icon: Eye, tone: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/10' },
    { label: 'Inícios', value: formatNumber(analytics.starts), icon: UsersRound, tone: 'text-violet-300 bg-violet-400/10 border-violet-400/10' },
    { label: 'Conclusões', value: formatNumber(analytics.completions), icon: CheckCircle2, tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/10' },
    { label: 'Conversão por início', value: formatPercent(analytics.conversionRate), icon: MousePointer2, tone: 'text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/10' },
    { label: 'Abandono estimado', value: formatNumber(analytics.abandonments), icon: ArrowDownRight, tone: 'text-amber-300 bg-amber-400/10 border-amber-400/10' },
  ]

  return (
    <div className="space-y-5">
      {analytics.sampled && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-200/75">
          O volume excede a janela de análise detalhada. Os totais são exatos; gráficos e abandono por página usam os eventos mais recentes.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-white/[0.07] bg-[#0b0c12]/90 p-4 shadow-[0_20px_70px_-48px_rgba(0,0,0,0.9)]">
            <div className={`grid size-9 place-items-center rounded-xl border ${tone}`}>
              <Icon className="size-4" />
            </div>
            <p className="mt-5 text-2xl font-extrabold tracking-[-0.04em] text-white">{value}</p>
            <p className="mt-1 text-[11px] font-medium text-zinc-600">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-white/[0.07] bg-[#0b0c12]/90 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-zinc-200">Atividade nos últimos 14 dias</p>
              <p className="mt-1 text-xs text-zinc-600">Primeiras interações e conclusões registradas.</p>
            </div>
            <span className="grid size-9 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-violet-300">
              <Activity className="size-4" />
            </span>
          </div>

          <div className="mt-8 flex h-56 items-end gap-1.5 sm:gap-2.5">
            {analytics.daily.map((day) => {
              const startHeight = day.starts === 0 ? 2 : Math.max(8, (day.starts / maxDaily) * 100)
              const completionHeight = day.completions === 0 ? 1 : Math.max(5, (day.completions / maxDaily) * 100)
              return (
                <div key={day.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div className="relative flex h-[180px] items-end justify-center gap-0.5 rounded-md bg-white/[0.015] px-0.5">
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
                  <span className="mt-2 truncate text-center text-[9px] text-zinc-700">{day.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex items-center justify-center gap-5 border-t border-white/[0.05] pt-4 text-[10px] font-medium text-zinc-600">
            <span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-violet-400" /> Inícios</span>
            <span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-cyan-300" /> Conclusões</span>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-[#0b0c12]/90 p-5 sm:p-6">
          <p className="text-sm font-bold text-zinc-200">Resumo da jornada</p>
          <p className="mt-1 text-xs text-zinc-600">Passagem entre as principais etapas do funil.</p>
          <div className="mt-7 space-y-4">
            <FunnelBar label="Visitas" value={analytics.visits} total={Math.max(analytics.visits, 1)} color="from-violet-600 to-indigo-400" />
            <FunnelBar label="Inícios por interação" value={analytics.starts} total={Math.max(analytics.visits, analytics.starts, 1)} color="from-indigo-600 to-cyan-400" />
            <FunnelBar label="Conclusões" value={analytics.completions} total={Math.max(analytics.visits, analytics.starts, 1)} color="from-cyan-600 to-emerald-400" />
          </div>
          <div className="mt-7 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">Critério de abandono</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Inícios sem conclusão, encerrados ou inativos há pelo menos 30 minutos.
              A abertura conta como visita; o início só acontece na primeira interação.
            </p>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0c12]/90">
        <div className="border-b border-white/[0.06] p-5 sm:p-6">
          <p className="text-sm font-bold text-zinc-200">Abandono por página</p>
          <p className="mt-1 text-xs text-zinc-600">Última página dos inícios que não chegaram à conclusão.</p>
        </div>

        {analytics.pageAnalytics.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-zinc-600">
            Nenhuma página encontrada neste funil.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {analytics.pageAnalytics.map((page, index) => (
              <div key={page.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(180px,0.8fr)_minmax(240px,1.7fr)_110px] sm:items-center sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.025] font-mono text-[10px] text-zinc-600">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-zinc-300">{page.name}</p>
                    <p className="mt-1 text-[10px] text-zinc-700">{formatNumber(page.visits)} visitas únicas</p>
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/[0.045]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-400 to-cyan-300"
                    style={{ width: `${page.visits === 0 ? 0 : Math.max(2, (page.visits / maxPageVisits) * 100)}%` }}
                  />
                </div>

                <div className="sm:text-right">
                  <p className="text-xs font-bold text-zinc-300">{formatPercent(page.abandonmentRate)}</p>
                  <p className="mt-1 text-[10px] text-zinc-700">{page.abandonments} abandonos</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = value === 0 ? 0 : Math.max(4, Math.min(100, (value / total) * 100))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-bold text-zinc-300">{formatNumber(value)}</span>
      </div>
      <div className="h-9 overflow-hidden rounded-lg bg-white/[0.035]">
        <div className={`h-full rounded-lg bg-gradient-to-r ${color} opacity-80`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
