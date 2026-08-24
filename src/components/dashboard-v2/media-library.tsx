'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  File,
  FileAudio,
  FileImage,
  FileVideo,
  LoaderCircle,
  Search,
  UploadCloud,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface MediaFunnel {
  id: string
  name: string
}

interface MediaLibraryProps {
  workspaceId?: string
  funnels: MediaFunnel[]
  // Picker mode is used when the library is opened from inside the element
  // inspector to fill a single URL field, rather than as the standalone
  // "media" dashboard view. `pickerFunnelId` fixes the funnel (the inspector
  // already knows which funnel it's editing, so the funnel switcher is
  // hidden) and `onSelect` is called with the asset's public URL instead of
  // just copying it to the clipboard.
  mode?: 'browse' | 'picker'
  pickerFunnelId?: string
  onSelect?: (url: string) => void
}

interface MediaAsset {
  name: string
  path: string
  url: string
  size: number
  mimeType: string
  createdAt: string | null
}

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm', 'application/pdf',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024

function displayName(name: string) {
  return name.includes('--') ? name.split('--').slice(1).join('--') : name
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function AssetIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <FileImage className="size-5" />
  if (mimeType.startsWith('video/')) return <FileVideo className="size-5" />
  if (mimeType.startsWith('audio/')) return <FileAudio className="size-5" />
  return <File className="size-5" />
}

export function MediaLibrary({ workspaceId, funnels, mode = 'browse', pickerFunnelId, onSelect }: MediaLibraryProps) {
  const isPicker = mode === 'picker'
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [funnelId, setFunnelId] = useState(pickerFunnelId || funnels[0]?.id || '')
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [copiedPath, setCopiedPath] = useState('')
  const [error, setError] = useState('')
  const selectedFunnelId = isPicker
    ? (pickerFunnelId || funnels[0]?.id || '')
    : funnels.some((funnel) => funnel.id === funnelId)
      ? funnelId
      : funnels[0]?.id || ''

  const loadAssets = useCallback(async () => {
    if (!workspaceId || !selectedFunnelId) {
      setAssets([])
      setLoading(false)
      return
    }
    setLoading(true)
    const prefix = `${workspaceId}/${selectedFunnelId}`
    const { data, error: listError } = await supabase.storage
      .from('funnel-assets')
      .list(prefix, { limit: 250, sortBy: { column: 'created_at', order: 'desc' } })

    if (listError) {
      setError('Não foi possível carregar os arquivos desta biblioteca.')
      setAssets([])
    } else {
      setAssets((data || []).filter((item) => item.id).map((item) => {
        const path = `${prefix}/${item.name}`
        return {
          name: item.name,
          path,
          url: supabase.storage.from('funnel-assets').getPublicUrl(path).data.publicUrl,
          size: Number(item.metadata?.size || 0),
          mimeType: String(item.metadata?.mimetype || item.metadata?.contentType || ''),
          createdAt: item.created_at || null,
        }
      }))
    }
    setLoading(false)
  }, [selectedFunnelId, supabase, workspaceId])

  useEffect(() => {
    const task = window.setTimeout(() => void loadAssets(), 0)
    return () => window.clearTimeout(task)
  }, [loadAssets])

  const upload = async (file: File) => {
    if (!workspaceId || !selectedFunnelId) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Formato não permitido. Use imagem, áudio, vídeo MP4/WebM ou PDF.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('O arquivo ultrapassa o limite de 10 MB.')
      return
    }

    setUploading(true)
    setError('')
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'arquivo'
    const path = `${workspaceId}/${selectedFunnelId}/${crypto.randomUUID()}--${safeName}`
    const { error: uploadError } = await supabase.storage.from('funnel-assets').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) setError('Não foi possível enviar o arquivo. Verifique seu acesso e tente novamente.')
    else await loadAssets()
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const copyUrl = async (asset: MediaAsset) => {
    await navigator.clipboard.writeText(asset.url)
    setCopiedPath(asset.path)
    window.setTimeout(() => setCopiedPath(''), 1800)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  const visibleAssets = assets.filter((asset) => !normalizedQuery || displayName(asset.name).toLocaleLowerCase('pt-BR').includes(normalizedQuery))

  if (!workspaceId) {
    return <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">Crie ou selecione um workspace para usar a biblioteca.</div>
  }

  if (!funnels.length) {
    return <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">Crie um funil V2 antes de adicionar arquivos à biblioteca.</div>
  }

  return (
    <div className={isPicker ? 'space-y-4' : 'space-y-5 pt-7'}>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className={isPicker ? 'grid flex-1 gap-3' : 'grid flex-1 gap-3 sm:grid-cols-2'}>
          {!isPicker && (
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              Funil
              <select value={selectedFunnelId} onChange={(event) => { setLoading(true); setError(''); setFunnelId(event.target.value) }} className="mt-2 h-10 w-full rounded-xl border border-border bg-muted/30 px-3 text-xs normal-case tracking-normal text-foreground outline-none focus:border-violet-400/40">
                {funnels.map((funnel) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}
              </select>
            </label>
          )}
          <label className="relative text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
            Buscar
            <Search className="pointer-events-none absolute bottom-3 left-3.5 size-4 text-muted-foreground/50" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do arquivo" className="mt-2 h-10 w-full rounded-xl border border-border bg-muted/30 pl-10 pr-3 text-xs normal-case tracking-normal text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-violet-400/40" />
          </label>
        </div>
        <div>
          <input ref={inputRef} type="file" className="sr-only" accept={ACCEPTED_TYPES.join(',')} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white transition hover:bg-violet-500 disabled:opacity-50">
            {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {uploading ? 'Enviando...' : 'Enviar arquivo'}
          </button>
        </div>
      </div>

      {!isPicker && (
        <p className="text-[11px] text-muted-foreground/60">Arquivos públicos do funil selecionado. Formatos permitidos: imagens, áudio, MP4/WebM e PDF, até 10 MB. A exclusão fica protegida para não quebrar versões publicadas, templates ou cópias.</p>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3 text-xs text-red-200/80">{error}</p>}

      {loading ? (
        <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-6 animate-spin text-violet-300" /></div>
      ) : visibleAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <FileImage className="mx-auto size-7 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">{query ? 'Nenhum arquivo encontrado' : 'Biblioteca vazia'}</p>
          <p className="mt-1 text-xs text-muted-foreground/50">{query ? 'Tente buscar por outro nome.' : 'Envie o primeiro arquivo para reutilizá-lo no funil.'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleAssets.map((asset) => (
            <article key={asset.path} className="group overflow-hidden rounded-2xl border border-border bg-card/80">
              <div className="relative grid aspect-[16/10] place-items-center overflow-hidden border-b border-border bg-black/10 text-muted-foreground/60">
                {asset.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                ) : <AssetIcon mimeType={asset.mimeType} />}
                <span className="absolute left-2.5 top-2.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-300 backdrop-blur">{asset.mimeType.split('/')[0] || 'arquivo'}</span>
              </div>
              <div className="p-3.5">
                <p className="truncate text-xs font-semibold text-foreground" title={displayName(asset.name)}>{displayName(asset.name)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground/50">{formatBytes(asset.size)}{asset.createdAt ? ` · ${new Date(asset.createdAt).toLocaleDateString('pt-BR')}` : ''}</p>
                <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                  {isPicker ? (
                    <button type="button" onClick={() => onSelect?.(asset.url)} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 text-[10px] font-bold text-white hover:bg-violet-500">
                      Usar este arquivo
                    </button>
                  ) : (
                    <button type="button" onClick={() => void copyUrl(asset)} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
                      {copiedPath === asset.path ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      {copiedPath === asset.path ? 'Copiado' : 'Copiar URL'}
                    </button>
                  )}
                  <a href={asset.url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg text-muted-foreground/60 hover:bg-accent hover:text-foreground" aria-label={`Abrir ${displayName(asset.name)}`}><ExternalLink className="size-3.5" /></a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
