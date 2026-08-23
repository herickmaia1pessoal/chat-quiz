'use client'

import { startTransition, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  Check,
  Copy,
  Globe2,
  KeyRound,
  LoaderCircle,
  Palette,
  RotateCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Webhook,
} from 'lucide-react'
import { saveFunnelDraftFromBuilder } from '@/app/dashboard/funnels/actions'
import {
  getFunnelWebhookDeliveryStatus,
  saveFunnelIntegration,
  sendTestWebhook,
} from '@/app/dashboard/funnels/integration-actions'
import type {
  FunnelIntegrationState,
  FunnelSettingsState,
  FunnelWebhookDeliveryRecord,
} from './types'

interface FunnelSettingsFormProps {
  initialState: FunnelSettingsState
  initialIntegration: FunnelIntegrationState
  initialDeliveries: FunnelWebhookDeliveryRecord[]
  onDirtyChange?: (dirty: boolean) => void
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function safeExternalScriptUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && hostname.includes('.')
      && !/^(?:localhost|\d+(?:\.\d+){3}|\[[0-9a-f:]+\])$/i.test(hostname)
      && !/(?:^|\.)(?:local|internal|localhost|home\.arpa)$/i.test(hostname)
  } catch {
    return false
  }
}

function fieldClassName() {
  return 'mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-[#0b0c12] px-3.5 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50'
}

export function FunnelSettingsForm({
  initialState,
  initialIntegration,
  initialDeliveries,
  onDirtyChange,
}: FunnelSettingsFormProps) {
  const router = useRouter()
  const [revision, setRevision] = useState(initialState.revision)
  const [document, setDocument] = useState(initialState.document)
  const [isSaving, setIsSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [webhookDirty, setWebhookDirty] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const changeSequence = useRef(0)
  const requestInFlight = useRef(false)

  const settings = document.settings
  const slugValid = SLUG_PATTERN.test(document.slug) && document.slug.length <= 120
  const metaPixelId = typeof settings.metaPixelId === 'string' ? settings.metaPixelId.trim() : ''
  const googleTagId = typeof settings.googleTagId === 'string' ? settings.googleTagId.trim() : ''
  const socialImage = typeof settings.socialImage === 'string' ? settings.socialImage.trim() : ''
  const faviconUrl = typeof settings.faviconUrl === 'string' ? settings.faviconUrl.trim() : ''
  const customScriptUrls = Array.isArray(settings.customScriptUrls)
    ? settings.customScriptUrls.filter((value): value is string => typeof value === 'string')
    : []
  const metaPixelValid = !metaPixelId || /^\d{5,20}$/.test(metaPixelId)
  const googleTagValid = !googleTagId || /^(?:G|GT|GTM|AW)-[A-Z0-9]{4,20}$/i.test(googleTagId)
  const socialImageValid = !socialImage || /^https:\/\/\S+$/i.test(socialImage)
  const faviconValid = !faviconUrl || /^https:\/\/\S+$/i.test(faviconUrl)
  const customScriptsValid = customScriptUrls.length <= 5 && customScriptUrls.every(safeExternalScriptUrl)
  const canSave = document.title.trim().length > 0
    && document.title.length <= 160
    && slugValid
    && metaPixelValid
    && googleTagValid
    && socialImageValid
    && faviconValid
    && customScriptsValid
    && dirty
    && !isSaving

  const draftPublicUrl = `/f/${document.slug}`

  const mutateDocument = (updater: (current: typeof document) => typeof document) => {
    setDocument(updater)
    changeSequence.current += 1
    setDirty(true)
    setFeedback(null)
  }

  const updateSetting = (key: string, value: unknown) => {
    mutateDocument((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }))
  }

  const hasUnsavedChanges = dirty || webhookDirty

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onDirtyChange])

  const save = () => {
    if (!canSave || requestInFlight.current) return
    requestInFlight.current = true
    const savedSequence = changeSequence.current
    const snapshot = {
      ...document,
      title: document.title.trim(),
      slug: document.slug.trim(),
    }
    setIsSaving(true)
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await saveFunnelDraftFromBuilder({
          funnelId: snapshot.funnelId,
          expectedRevision: revision,
          document: snapshot,
          label: 'Configurações do funil',
        })

        if (!result.ok || result.revision === undefined) {
          setFeedback({
            type: 'error',
            message: result.conflict
              ? 'Este funil mudou em outra aba. Recarregue a página antes de salvar novamente.'
              : result.error || 'Não foi possível salvar as configurações.',
          })
          return
        }

        const hasNewerChanges = changeSequence.current !== savedSequence
        setRevision(result.revision)
        if (!hasNewerChanges) {
          setDocument(snapshot)
          setDirty(false)
        }
        setFeedback({
          type: 'success',
          message: hasNewerChanges
            ? `Revisão ${result.revision} salva; há alterações mais recentes nesta tela.`
            : `Configurações salvas na revisão ${result.revision}.`,
        })
        router.refresh()
      } catch {
        setFeedback({ type: 'error', message: 'Não foi possível salvar as configurações.' })
      } finally {
        requestInFlight.current = false
        setIsSaving(false)
      }
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <SettingsSection
          icon={Globe2}
          title="Identidade e endereço"
          description="Defina como o funil aparece no workspace e em seu link público."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-400">
              Nome do funil
              <input
                value={document.title}
                maxLength={160}
                onChange={(event) => {
                  mutateDocument((current) => ({ ...current, title: event.target.value }))
                }}
                className={fieldClassName()}
                placeholder="Meu funil"
              />
              <span className="mt-1.5 block text-[10px] font-normal text-zinc-700">{document.title.length}/160 caracteres</span>
            </label>

            <label className="text-xs font-semibold text-zinc-400">
              Slug público
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-zinc-700">/f/</span>
                <input
                  value={document.slug}
                  maxLength={120}
                  onChange={(event) => {
                    mutateDocument((current) => ({ ...current, slug: event.target.value.toLowerCase() }))
                  }}
                  className={`${fieldClassName()} pl-10 ${document.slug && !slugValid ? 'border-red-400/40 focus:border-red-400/60' : ''}`}
                  placeholder="meu-funil"
                  aria-invalid={!slugValid}
                />
              </div>
              <span className={`mt-1.5 block text-[10px] font-normal ${document.slug && !slugValid ? 'text-red-400/80' : 'text-zinc-700'}`}>
                Use letras minúsculas, números e hífens.
              </span>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Search}
          title="SEO e compartilhamento"
          description="Personalize o título e a descrição exibidos em buscadores e redes sociais."
        >
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-zinc-400">
              Título SEO
              <input
                value={typeof settings.seoTitle === 'string' ? settings.seoTitle : ''}
                maxLength={70}
                onChange={(event) => updateSetting('seoTitle', event.target.value)}
                className={fieldClassName()}
                placeholder={document.title}
              />
              <span className="mt-1.5 block text-[10px] font-normal text-zinc-700">Recomendado: até 60 caracteres.</span>
            </label>

            <label className="block text-xs font-semibold text-zinc-400">
              Descrição SEO
              <textarea
                value={typeof settings.seoDescription === 'string' ? settings.seoDescription : ''}
                maxLength={180}
                rows={4}
                onChange={(event) => updateSetting('seoDescription', event.target.value)}
                className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-[#0b0c12] px-3.5 py-3 text-sm leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/10"
                placeholder="Uma descrição curta e clara sobre esta experiência."
              />
            </label>

            <label className="block text-xs font-semibold text-zinc-400">
              Imagem social (URL)
              <input
                value={typeof settings.socialImage === 'string' ? settings.socialImage : ''}
                maxLength={2048}
                type="url"
                onChange={(event) => updateSetting('socialImage', event.target.value)}
                className={`${fieldClassName()} ${!socialImageValid ? 'border-red-400/40' : ''}`}
                placeholder="https://..."
                aria-invalid={!socialImageValid}
              />
            </label>

            <label className="block text-xs font-semibold text-zinc-400">
              Favicon (URL)
              <input
                value={typeof settings.faviconUrl === 'string' ? settings.faviconUrl : ''}
                maxLength={2048}
                type="url"
                onChange={(event) => updateSetting('faviconUrl', event.target.value)}
                className={`${fieldClassName()} ${!faviconValid ? 'border-red-400/40' : ''}`}
                placeholder="https://.../favicon.png"
                aria-invalid={!faviconValid}
              />
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <input
                type="checkbox"
                checked={settings.noIndex === true}
                onChange={(event) => updateSetting('noIndex', event.target.checked)}
                className="mt-0.5 size-4 accent-violet-500"
              />
              <span>
                <span className="block text-xs font-semibold text-zinc-300">Ocultar dos buscadores</span>
                <span className="mt-1 block text-[11px] font-normal leading-5 text-zinc-600">Publica as diretivas noindex e nofollow para este funil.</span>
              </span>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Palette}
          title="Aparência geral"
          description="A cor base é herdada pelas páginas que não possuem um fundo específico."
        >
          <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-end">
            <label className="text-xs font-semibold text-zinc-400">
              Cor de fundo
              <input
                type="color"
                value={typeof settings.backgroundColor === 'string' ? settings.backgroundColor : '#050507'}
                onChange={(event) => updateSetting('backgroundColor', event.target.value)}
                className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-white/[0.08] bg-[#0b0c12] p-1.5"
              />
            </label>
            <label className="text-xs font-semibold text-zinc-400">
              Valor hexadecimal
              <input
                value={typeof settings.backgroundColor === 'string' ? settings.backgroundColor : '#050507'}
                onChange={(event) => updateSetting('backgroundColor', event.target.value)}
                className={fieldClassName()}
                placeholder="#050507"
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Activity}
          title="Pixels e mensuração"
          description="IDs validados são carregados somente na versão publicada; o preview do editor não dispara eventos."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-400">
              Meta Pixel ID
              <input
                value={typeof settings.metaPixelId === 'string' ? settings.metaPixelId : ''}
                maxLength={20}
                inputMode="numeric"
                onChange={(event) => updateSetting('metaPixelId', event.target.value.trim())}
                className={`${fieldClassName()} ${!metaPixelValid ? 'border-red-400/40' : ''}`}
                placeholder="123456789012345"
                aria-invalid={!metaPixelValid}
              />
              {!metaPixelValid && <span className="mt-1.5 block text-[10px] font-normal text-red-400/80">Use apenas 5 a 20 números.</span>}
            </label>

            <label className="text-xs font-semibold text-zinc-400">
              Google Tag ID
              <input
                value={typeof settings.googleTagId === 'string' ? settings.googleTagId : ''}
                maxLength={24}
                onChange={(event) => updateSetting('googleTagId', event.target.value.toUpperCase().trim())}
                className={`${fieldClassName()} ${!googleTagValid ? 'border-red-400/40' : ''}`}
                placeholder="G-XXXXXXXXXX"
                aria-invalid={!googleTagValid}
              />
              {!googleTagValid && <span className="mt-1.5 block text-[10px] font-normal text-red-400/80">Use um ID G-, GT-, GTM- ou AW- válido.</span>}
            </label>
          </div>
          <label className="mt-4 block text-xs font-semibold text-zinc-400">
            Scripts externos isolados
            <textarea
              value={customScriptUrls.join('\n')}
              rows={4}
              maxLength={10244}
              onChange={(event) => updateSetting(
                'customScriptUrls',
                event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
              )}
              className={`mt-2 w-full resize-y rounded-xl border bg-[#0b0c12] px-3.5 py-3 font-mono text-xs leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:ring-2 focus:ring-violet-500/10 ${customScriptsValid ? 'border-white/[0.08] focus:border-violet-400/45' : 'border-red-400/40 focus:border-red-400/60'}`}
              placeholder={'https://cdn.seudominio.com/tracking.js\nhttps://scripts.parceiro.com/widget.js'}
              aria-invalid={!customScriptsValid}
            />
            <span className={`mt-1.5 block text-[10px] font-normal ${customScriptsValid ? 'text-zinc-700' : 'text-red-400/80'}`}>
              Um URL HTTPS por linha, no máximo 5. Cada script roda em iframe sandbox, sem acesso ao formulário, cookies ou DOM principal.
            </span>
          </label>
        </SettingsSection>

        <WebhookSettings
          funnelId={document.funnelId}
          initialIntegration={initialIntegration}
          initialDeliveries={initialDeliveries}
          onDirtyChange={setWebhookDirty}
        />
      </div>

      <aside className="space-y-5">
        <section className="sticky top-28 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0c12]/95">
          <div className="border-b border-white/[0.06] p-5">
            <p className="text-sm font-bold text-zinc-200">Prévia do compartilhamento</p>
            <p className="mt-1 text-xs text-zinc-600">Exemplo de como o link pode aparecer.</p>
          </div>
          <div className="p-5">
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#101118]">
              <div
                className="h-32 border-b border-white/[0.06] bg-[radial-gradient(circle_at_50%_20%,rgba(124,58,237,0.23),transparent_55%)]"
                style={{ backgroundColor: typeof settings.backgroundColor === 'string' ? settings.backgroundColor : '#050507' }}
              />
              <div className="p-4">
                <p className="line-clamp-1 text-sm font-bold text-zinc-200">
                  {(typeof settings.seoTitle === 'string' && settings.seoTitle) || document.title || 'Título do funil'}
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-600">
                  {(typeof settings.seoDescription === 'string' && settings.seoDescription) || 'Adicione uma descrição para melhorar o compartilhamento.'}
                </p>
                <p className="mt-3 truncate text-[10px] text-violet-400/70">URL do rascunho: {draftPublicUrl}</p>
                {initialState.publishedSlug && (
                  <p className="mt-1 truncate text-[10px] text-emerald-400/65">
                    Publicado agora: /f/{initialState.publishedSlug}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05] p-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <p className="text-[11px] leading-5 text-emerald-100/55">
                Salvar cria uma nova revisão do rascunho. A versão pública não muda até uma nova publicação.
              </p>
            </div>

            {feedback && (
              <div
                role="status"
                className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs leading-5 ${
                  feedback.type === 'success'
                    ? 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-200/80'
                    : 'border-red-400/15 bg-red-400/[0.06] text-red-200/80'
                }`}
              >
                {feedback.type === 'success' && <Check className="mt-0.5 size-3.5 shrink-0" />}
                {feedback.message}
              </div>
            )}

            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 px-4 text-xs font-extrabold text-white shadow-[0_14px_35px_-16px_rgba(99,102,241,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-45"
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSaving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </section>
      </aside>
    </div>
  )
}

function WebhookSettings({
  funnelId,
  initialIntegration,
  initialDeliveries,
  onDirtyChange,
}: {
  funnelId: string
  initialIntegration: FunnelIntegrationState
  initialDeliveries: FunnelWebhookDeliveryRecord[]
  onDirtyChange: (dirty: boolean) => void
}) {
  const [integration, setIntegration] = useState(initialIntegration)
  const [enabled, setEnabled] = useState(initialIntegration.webhookEnabled)
  const [url, setUrl] = useState(initialIntegration.webhookUrl)
  const [secret, setSecret] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error' | 'pending'; message: string } | null>(null)

  const urlValid = !url || /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/\S*)?$/.test(url)
  const secretValid = !secret || (secret.length >= 16 && secret.length <= 160)
  const canSave = !saving
    && urlValid
    && secretValid
    && (!enabled || Boolean(url))

  const reportDirty = (nextEnabled: boolean, nextUrl: string, nextSecret: string) => {
    onDirtyChange(
      nextEnabled !== integration.webhookEnabled
      || nextUrl !== integration.webhookUrl
      || Boolean(nextSecret),
    )
  }

  const persist = (rotateSecret = false) => {
    if (!canSave && !rotateSecret) return
    setSaving(true)
    setFeedback(null)
    setNewSecret('')
    startTransition(async () => {
      const result = await saveFunnelIntegration(funnelId, {
        webhookEnabled: enabled,
        webhookUrl: url,
        webhookSecret: secret,
        rotateSecret,
      })

      if (!result.ok || !result.state) {
        setFeedback({ type: 'error', message: result.error || 'Não foi possível salvar o webhook.' })
        setSaving(false)
        return
      }

      setIntegration(result.state)
      setEnabled(result.state.webhookEnabled)
      setUrl(result.state.webhookUrl)
      setSecret('')
      setNewSecret(result.newSecret || '')
      onDirtyChange(false)
      setFeedback({ type: 'success', message: 'Integração atualizada com sucesso.' })
      setSaving(false)
    })
  }

  const runTest = () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    startTransition(async () => {
      const result = await sendTestWebhook(funnelId)
      if (!result.ok || !result.deliveryId) {
        setTestResult({ type: 'error', message: result.error || 'Não foi possível enviar o teste.' })
        setTesting(false)
        return
      }

      setTestResult({ type: 'pending', message: 'Teste enviado. Aguardando resposta do endpoint...' })

      const deliveryId = result.deliveryId
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        const status = await getFunnelWebhookDeliveryStatus(funnelId, deliveryId)
        if (!status) break
        if (status.status === 'succeeded') {
          setTestResult({ type: 'success', message: `Sucesso — HTTP ${status.statusCode ?? '200'}.` })
          setTesting(false)
          return
        }
        if (status.status === 'failed') {
          setTestResult({ type: 'error', message: status.lastError || `Falha${status.statusCode ? ` — HTTP ${status.statusCode}` : ''}.` })
          setTesting(false)
          return
        }
      }
      setTestResult({ type: 'pending', message: 'Ainda processando. Confira novamente em instantes.' })
      setTesting(false)
    })
  }

  return (
    <SettingsSection
      icon={Webhook}
      title="Webhook de conclusão"
      description="Envia cada conclusão em JSON com assinatura HMAC SHA-256, registro do resultado e até três tentativas."
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <span>
            <span className="block text-xs font-semibold text-zinc-300">Ativar webhook</span>
            <span className="mt-1 block text-[11px] leading-5 text-zinc-600">O envio acontece depois que a submissão foi persistida.</span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => { const next = event.target.checked; setEnabled(next); reportDirty(next, url, secret); setFeedback(null) }}
            className="mt-0.5 size-4 accent-violet-500"
          />
        </label>

        <label className="block text-xs font-semibold text-zinc-400">
          Endpoint HTTPS
          <input
            type="url"
            value={url}
            maxLength={2048}
            onChange={(event) => { const next = event.target.value.trim(); setUrl(next); reportDirty(enabled, next, secret); setFeedback(null) }}
            className={`${fieldClassName()} ${!urlValid ? 'border-red-400/40' : ''}`}
            placeholder="https://api.seudominio.com/webhooks/funnel"
            aria-invalid={!urlValid}
          />
          <span className={`mt-1.5 block text-[10px] font-normal ${urlValid ? 'text-zinc-700' : 'text-red-400/80'}`}>
            Apenas destinos HTTPS públicos e aprovados pelo administrador da plataforma são aceitos.
          </span>
        </label>

        <label className="block text-xs font-semibold text-zinc-400">
          Segredo da assinatura
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-700" />
            <input
              type="password"
              autoComplete="new-password"
              value={secret}
              minLength={16}
              maxLength={160}
              onChange={(event) => { const next = event.target.value; setSecret(next); reportDirty(enabled, url, next); setFeedback(null) }}
              className={`${fieldClassName()} pl-10 ${!secretValid ? 'border-red-400/40' : ''}`}
              placeholder={integration.secretPreview || 'Deixe vazio para gerar automaticamente'}
              aria-invalid={!secretValid}
            />
          </div>
          <span className="mt-1.5 block text-[10px] font-normal text-zinc-700">
            {integration.hasWebhookSecret ? `Segredo atual: ${integration.secretPreview}` : 'Ao ativar sem preencher, um segredo forte será gerado.'}
          </span>
        </label>

        {newSecret && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
            <p className="text-xs font-semibold text-amber-200">Copie o novo segredo agora</p>
            <code className="mt-2 block break-all rounded-lg bg-black/25 p-3 text-[11px] leading-5 text-amber-100/80">{newSecret}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(newSecret)}
              className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-amber-300/15 px-3 text-[10px] font-bold text-amber-100/75 hover:bg-amber-300/10"
            >
              <Copy className="size-3.5" /> Copiar segredo
            </button>
          </div>
        )}

        {feedback && (
          <p role="status" className={`rounded-xl border px-3.5 py-3 text-xs ${feedback.type === 'success' ? 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-200/80' : 'border-red-400/15 bg-red-400/[0.05] text-red-200/80'}`}>
            {feedback.message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => persist(false)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar webhook
          </button>
          {integration.hasWebhookSecret && (
            <button
              type="button"
              disabled={saving || !urlValid || !url}
              onClick={() => persist(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
            >
              <RotateCw className="size-4" /> Girar segredo
            </button>
          )}
          {integration.webhookEnabled && integration.hasWebhookSecret && (
            <button
              type="button"
              disabled={testing}
              onClick={runTest}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-400/20 px-4 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {testing ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar teste
            </button>
          )}
        </div>

        {testResult && (
          <p role="status" className={`rounded-xl border px-3.5 py-3 text-xs ${testResult.type === 'success' ? 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-200/80' : testResult.type === 'error' ? 'border-red-400/15 bg-red-400/[0.05] text-red-200/80' : 'border-amber-400/15 bg-amber-400/[0.05] text-amber-200/80'}`}>
            {testResult.message}
          </p>
        )}

        <div className="border-t border-white/[0.06] pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-zinc-300">Entregas recentes</p>
              <p className="mt-1 text-[10px] text-zinc-700">Status HTTP e número de tentativas.</p>
            </div>
            <Activity className="size-4 text-zinc-700" />
          </div>
          {initialDeliveries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.07] py-7 text-center text-xs text-zinc-700">Nenhuma entrega registrada.</div>
          ) : (
            <div className="space-y-2">
              {initialDeliveries.map((delivery) => {
                const tone = delivery.status === 'succeeded'
                  ? 'text-emerald-300 bg-emerald-400/[0.06] border-emerald-400/10'
                  : delivery.status === 'failed'
                    ? 'text-red-300 bg-red-400/[0.06] border-red-400/10'
                    : 'text-amber-300 bg-amber-400/[0.06] border-amber-400/10'
                return (
                  <div key={delivery.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-black/15 px-3.5 py-3 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 font-bold uppercase tracking-wider ${tone}`}>{delivery.status}</span>
                    <span className="text-zinc-500">{delivery.statusCode ? `HTTP ${delivery.statusCode}` : 'Sem resposta'}</span>
                    <span className="text-zinc-600">{delivery.attemptCount}/3 tentativas</span>
                    <time className="ml-auto text-zinc-700" dateTime={delivery.createdAt}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(delivery.createdAt))}</time>
                    {delivery.lastError && <p className="w-full truncate text-red-300/60" title={delivery.lastError}>{delivery.lastError}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Globe2
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0b0c12]/90 p-5 sm:p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-400/10 bg-violet-500/[0.08] text-violet-300">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-zinc-200">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
