'use client'

import { useState } from 'react'
import { Download, Users, CheckCircle2, Clock, Search, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// wa.me links require the country code. Leads captured with a plain BR-format
// phone (10-11 digits, no "+55") otherwise open WhatsApp to an invalid number.
function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`
  }
  return digits
}

export function LeadsTab({ leads, questions }: { leads: any[]; questions: any[] }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredLeads = leads.filter((lead) => {
    const term = searchTerm.toLowerCase()
    const nameMatch = lead.name?.toLowerCase().includes(term)
    const phoneMatch = lead.phone?.toLowerCase().includes(term)
    const utmMatch = lead.utm_source?.toLowerCase().includes(term) || lead.utm_campaign?.toLowerCase().includes(term)
    return !term || nameMatch || phoneMatch || utmMatch
  })

  // RFC 4180-style escaping: always quote, double up any embedded quotes.
  // Doing this for every field (not just some) avoids silently corrupted
  // columns whenever a name, UTM value, or question title contains a comma or quote.
  const escapeCsvField = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`

  const exportToCSV = () => {
    if (leads.length === 0) return

    // Build headers: Date, Name, Phone, Status, UTMs, then Question titles
    const headers = [
      'Data',
      'Nome',
      'Telefone/WhatsApp',
      'Status',
      'UTM Source',
      'UTM Medium',
      'UTM Campaign',
      ...questions.map((q) => `Pergunta: ${q.title}`),
    ]

    const rows = leads.map((lead) => {
      const answersMap: { [qId: string]: string } = {}
      lead.answers?.forEach((ans: any) => {
        const optText = ans.option?.text
        answersMap[ans.question_id] = optText || ans.text_value || ''
      })

      return [
        new Date(lead.created_at).toLocaleString('pt-BR'),
        lead.name || '',
        lead.phone || '',
        lead.status,
        lead.utm_source || '',
        lead.utm_medium || '',
        lead.utm_campaign || '',
        ...questions.map((q) => answersMap[q.id] || ''),
      ]
    })

    // Prefix with a UTF-8 BOM so Excel opens accented pt-BR characters correctly.
    const csvBody = [headers, ...rows]
      .map((row) => row.map(escapeCsvField).join(','))
      .join('\r\n')
    const blob = new Blob(['﻿' + csvBody], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `leads_quiz_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const completedCount = leads.filter((l) => l.status === 'completed').length
  const totalCount = leads.length
  const conversionRate = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* Funnel Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="uppercase font-medium">Inícios de Quiz</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{totalCount}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="uppercase font-medium">Leads Concluídos</span>
            <Users className="h-4 w-4 text-zinc-500" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{completedCount}</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="uppercase font-medium">Taxa de Conclusão</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{conversionRate}%</p>
        </div>
      </div>

      {/* Leads Table Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Buscar por nome, telefone ou UTM..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-zinc-800 bg-zinc-900/50 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <Button
          onClick={exportToCSV}
          disabled={leads.length === 0}
          variant="outline"
          className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar Leads (CSV)
        </Button>
      </div>

      {/* Leads Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden backdrop-blur-xl">
        <Table>
          <TableHeader className="bg-zinc-900/80 border-b border-zinc-800">
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400 font-medium text-xs">Data</TableHead>
              <TableHead className="text-zinc-400 font-medium text-xs">Nome</TableHead>
              <TableHead className="text-zinc-400 font-medium text-xs">WhatsApp / Telefone</TableHead>
              <TableHead className="text-zinc-400 font-medium text-xs">Origem (UTM)</TableHead>
              <TableHead className="text-zinc-400 font-medium text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-zinc-500 text-sm">
                  Nenhum lead capturado ainda. Divulgue o link do seu quiz para começar a receber respostas.
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="border-zinc-800/60 hover:bg-zinc-800/30 transition">
                  <TableCell className="text-xs text-zinc-400 font-mono">
                    {new Date(lead.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-zinc-200">
                    {lead.name || <span className="text-zinc-600 italic">Não informado</span>}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-300 font-mono">
                    {lead.phone ? (
                      <a
                        href={`https://wa.me/${toWhatsAppNumber(lead.phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                      >
                        {lead.phone}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-600 italic">Não informado</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {lead.utm_source ? (
                      <Badge variant="outline" className="border-zinc-700 bg-zinc-800 text-zinc-300 font-mono">
                        {lead.utm_source} {lead.utm_campaign && `/ ${lead.utm_campaign}`}
                      </Badge>
                    ) : (
                      <span className="text-zinc-600">Direto / Orgânico</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        lead.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }
                    >
                      {lead.status === 'completed' ? 'Concluído' : 'Em andamento'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
