'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Download,
  Inbox,
  Mail,
  Phone,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'
import type { FunnelSubmissionRecord } from './types'
import { createClient } from '@/utils/supabase/client'

interface LeadsClientProps {
  funnelName: string
  submissions: FunnelSubmissionRecord[]
  truncated: boolean
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatDate(value: string, withTime = true) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(value))
}

function csvCell(value: unknown) {
  const displayed = displayValue(value)
  const inert = typeof value !== 'number' && /^[\s]*[=+\-@]/.test(displayed)
    ? `'${displayed}`
    : displayed
  return `"${inert.replaceAll('"', '""')}"`
}

function safeFilename(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function privateUploadPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return null
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(value) ? value : null
}

export function LeadsClient({ funnelName, submissions, truncated }: LeadsClientProps) {
  const supabase = useMemo(() => createClient(), [])
  const [query, setQuery] = useState('')
  const [resultFilter, setResultFilter] = useState('all')
  const [period, setPeriod] = useState('all')
  const [selected, setSelected] = useState<FunnelSubmissionRecord | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [filterNow] = useState(() => Date.now())

  const [tagFilter, setTagFilter] = useState('all')

  const resultOptions = useMemo(
    () => Array.from(new Set(submissions.map((item) => item.resultKey).filter(Boolean))).sort() as string[],
    [submissions],
  )

  const tagOptions = useMemo(
    () => Array.from(new Set(submissions.flatMap((item) => item.tags))).sort(),
    [submissions],
  )

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    const periodDays = period === 'all' ? null : Number(period)

    return submissions.filter((submission) => {
      if (resultFilter !== 'all' && submission.resultKey !== resultFilter) return false
      if (tagFilter !== 'all' && !submission.tags.includes(tagFilter)) return false
      if (periodDays) {
        const age = filterNow - new Date(submission.submittedAt).getTime()
        if (age > periodDays * 24 * 60 * 60 * 1000) return false
      }
      if (!normalizedQuery) return true
      const answerText = submission.values.map((value) => displayValue(value.value)).join(' ')
      return [submission.name, submission.email, submission.phone, submission.resultKey, answerText, ...submission.tags]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedQuery)
    })
  }, [filterNow, period, query, resultFilter, tagFilter, submissions])

  const exportCsv = () => {
    const answerKeys = Array.from(
      new Set(filtered.flatMap((submission) => submission.values.map((value) => value.fieldKey))),
    ).sort()
    const headers = ['Nome', 'E-mail', 'Telefone', 'Score', 'Resultado', 'Tags', 'Enviado em', ...answerKeys]
    const lines = [
      headers.map(csvCell).join(','),
      ...filtered.map((submission) => {
        const answers = new Map(submission.values.map((value) => [value.fieldKey, value.value]))
        return [
          submission.name,
          submission.email,
          submission.phone,
          submission.score,
          submission.resultKey,
          submission.tags.join('; '),
          submission.submittedAt,
          ...answerKeys.map((key) => answers.get(key)),
        ]
          .map(csvCell)
          .join(',')
      }),
    ]
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeFilename(funnelName) || 'funil'}-leads.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const downloadUpload = async (path: string) => {
    setDownloadError('')
    const { data, error } = await supabase.storage.from('funnel-uploads').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) {
      setDownloadError('Não foi possível gerar o link do arquivo.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0c12]/90 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)]">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar leads</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, contato, resultado ou resposta..."
              className="h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] pl-10 pr-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/10"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <span className="sr-only">Filtrar por resultado</span>
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <select
                value={resultFilter}
                onChange={(event) => setResultFilter(event.target.value)}
                className="h-11 min-w-40 appearance-none rounded-xl border border-white/[0.07] bg-[#101118] pl-9 pr-8 text-xs font-semibold text-zinc-300 outline-none focus:border-violet-400/45"
              >
                <option value="all">Todos os resultados</option>
                {resultOptions.map((result) => (
                  <option key={result} value={result}>{result}</option>
                ))}
              </select>
            </label>

            {tagOptions.length > 0 && (
              <label className="relative">
                <span className="sr-only">Filtrar por tag</span>
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
                <select
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  className="h-11 min-w-36 appearance-none rounded-xl border border-white/[0.07] bg-[#101118] pl-9 pr-8 text-xs font-semibold text-zinc-300 outline-none focus:border-violet-400/45"
                >
                  <option value="all">Todas as tags</option>
                  {tagOptions.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="relative">
              <span className="sr-only">Filtrar por período</span>
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="h-11 min-w-36 appearance-none rounded-xl border border-white/[0.07] bg-[#101118] pl-9 pr-8 text-xs font-semibold text-zinc-300 outline-none focus:border-violet-400/45"
              >
                <option value="all">Todo o período</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
              </select>
            </label>

            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 text-xs font-bold text-white shadow-[0_12px_30px_-14px_rgba(124,58,237,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3 text-[11px] text-zinc-600">
          <span>{filtered.length} de {submissions.length} leads</span>
          {truncated && <span>Exibindo os 500 envios mais recentes</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="grid min-h-80 place-items-center px-6 py-16 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-zinc-600">
                <Inbox className="size-5" />
              </span>
              <h2 className="mt-4 text-sm font-bold text-zinc-300">
                {submissions.length === 0 ? 'Nenhum lead recebido ainda' : 'Nenhum lead corresponde aos filtros'}
              </h2>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                {submissions.length === 0
                  ? 'Os envios concluídos aparecerão aqui com todas as respostas.'
                  : 'Ajuste a busca ou remova algum filtro para ampliar os resultados.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: card list, one lead per row of info instead of a dense table. */}
            <div className="divide-y divide-white/[0.045] sm:hidden">
              {filtered.map((submission) => (
                <button
                  type="button"
                  key={submission.id}
                  onClick={() => setSelected(submission)}
                  className="flex w-full items-start gap-3 px-4 py-4 text-left transition active:bg-violet-500/[0.06]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-400/10 bg-violet-500/10 text-xs font-bold text-violet-300">
                    {(submission.name || submission.email || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-200">{submission.name || 'Lead sem nome'}</p>
                      <ChevronRight className="size-4 shrink-0 text-zinc-600" />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{submission.email || submission.phone || 'Sem contato'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {submission.resultKey && (
                        <span className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.07] px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                          {submission.resultKey}
                        </span>
                      )}
                      {submission.score !== null && (
                        <span className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                          Score {submission.score}
                        </span>
                      )}
                      {submission.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-violet-400/15 bg-violet-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-violet-300">{tag}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-700">{formatDate(submission.submittedAt)} · {submission.values.length} respostas</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop/tablet: full table. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.015] text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">
                    <th className="px-5 py-3.5">Lead</th>
                    <th className="px-4 py-3.5">Contato</th>
                    <th className="px-4 py-3.5">Resultado</th>
                    <th className="px-4 py-3.5">Tags</th>
                    <th className="px-4 py-3.5">Score</th>
                    <th className="px-4 py-3.5">Enviado em</th>
                    <th className="px-5 py-3.5 text-right">Respostas</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((submission) => (
                    <tr
                      key={submission.id}
                      onClick={() => setSelected(submission)}
                      className="cursor-pointer border-b border-white/[0.045] text-sm transition last:border-0 hover:bg-violet-500/[0.045]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-400/10 bg-violet-500/10 text-xs font-bold text-violet-300">
                            {(submission.name || submission.email || '?').slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-52 truncate font-semibold text-zinc-200">{submission.name || 'Lead sem nome'}</p>
                            <p className="mt-0.5 text-[11px] text-zinc-600">{submission.values.length} respostas</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-56 truncate text-xs text-zinc-400">{submission.email || '—'}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">{submission.phone || 'Sem telefone'}</p>
                      </td>
                      <td className="px-4 py-4">
                        {submission.resultKey ? (
                          <span className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.07] px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                            {submission.resultKey}
                          </span>
                        ) : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        {submission.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {submission.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-violet-400/15 bg-violet-500/[0.08] px-2 py-0.5 text-[10px] font-semibold text-violet-300">{tag}</span>
                            ))}
                          </div>
                        ) : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-zinc-400">{submission.score ?? '—'}</td>
                      <td className="px-4 py-4 text-xs text-zinc-500">{formatDate(submission.submittedAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelected(submission)
                          }}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.06] hover:text-white"
                          aria-label={`Ver respostas de ${submission.name || 'lead'}`}
                        >
                          <ChevronRight className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/72 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Detalhes do lead">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setSelected(null)} aria-label="Fechar detalhes" />
          <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-white/[0.08] bg-[#0b0c12] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/[0.07] bg-[#0b0c12]/95 p-5 backdrop-blur-xl">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400/75">Detalhes do lead</p>
                <h2 className="mt-2 text-xl font-extrabold tracking-[-0.025em] text-white">{selected.name || 'Lead sem nome'}</h2>
                <p className="mt-1 text-xs text-zinc-600">Recebido em {formatDate(selected.submittedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="grid size-9 place-items-center rounded-xl border border-white/[0.07] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-6 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailCard icon={UserRound} label="Nome" value={selected.name} />
                <DetailCard icon={Mail} label="E-mail" value={selected.email} />
                <DetailCard icon={Phone} label="Telefone" value={selected.phone} />
                <DetailCard icon={SlidersHorizontal} label="Resultado" value={selected.resultKey} />
              </div>

              {selected.tags.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-bold text-zinc-200">Tags</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-violet-400/15 bg-violet-500/[0.08] px-2.5 py-1 text-[11px] font-semibold text-violet-300">{tag}</span>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-200">Respostas</h3>
                  <span className="text-[11px] text-zinc-600">{selected.values.length} campos</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                  {selected.values.length === 0 ? (
                    <p className="p-5 text-sm text-zinc-600">Nenhuma resposta registrada.</p>
                  ) : selected.values.map((answer) => {
                    const uploadPath = privateUploadPath(answer.value)
                    return (
                      <div key={answer.id} className="border-b border-white/[0.055] p-4 last:border-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-600">{answer.fieldKey}</p>
                        {uploadPath ? (
                          <button type="button" onClick={() => void downloadUpload(uploadPath)} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-violet-400/15 bg-violet-500/[0.07] px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/10">
                            <Download className="size-3.5" /> Baixar arquivo enviado
                          </button>
                        ) : (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{displayValue(answer.value)}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
                {downloadError && <p role="alert" className="mt-2 text-xs text-rose-300">{downloadError}</p>}
              </section>

              {Object.keys(selected.lead).length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-bold text-zinc-200">Dados complementares</h3>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                    {Object.entries(selected.lead).map(([key, value]) => (
                      <div key={key} className="flex gap-4 border-b border-white/[0.05] py-2.5 first:pt-0 last:border-0 last:pb-0">
                        <span className="w-32 shrink-0 text-xs text-zinc-600">{key}</span>
                        <span className="min-w-0 break-words text-xs text-zinc-300">{displayValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound
  label: string
  value: string | null
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 break-words text-xs font-medium text-zinc-300">{value || '—'}</p>
    </div>
  )
}
