'use client'

import { useState } from 'react'
import { Save, ExternalLink, Check, Copy, GitBranch, Eye, EyeOff } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { updateQuizSettings } from '@/app/dashboard/actions'

export function SettingsTab({ quiz }: { quiz: any }) {
  const [title, setTitle] = useState(quiz.title || '')
  const [description, setDescription] = useState(quiz.description || '')
  const [metaPixelId, setMetaPixelId] = useState(quiz.meta_pixel_id || '')
  const [ga4MeasurementId, setGa4MeasurementId] = useState(quiz.ga4_measurement_id || '')
  const [webhookUrl, setWebhookUrl] = useState(quiz.webhook_url || '')
  const [redirectUrl, setRedirectUrl] = useState(quiz.redirect_url || '')
  const [isPublished, setIsPublished] = useState(quiz.status === 'published')
  const [showBranding, setShowBranding] = useState(quiz.show_branding !== false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/q/${quiz.id}`
    : `/q/${quiz.id}`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateQuizSettings(quiz.id, {
        title,
        description,
        meta_pixel_id: metaPixelId,
        ga4_measurement_id: ga4MeasurementId,
        webhook_url: webhookUrl,
        redirect_url: redirectUrl,
        status: isPublished ? 'published' : 'draft',
        show_branding: showBranding,
      })
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      {/* Public Link Bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-200">Link Público do Player:</span>
            {isPublished ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Online & Pronto para Tráfego
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                Rascunho (Privado)
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-zinc-400 truncate max-w-md">{publicUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm"
            onClick={handleCopyLink}
            className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-1.5">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar Link'}
          </Button>
          <a href={`/q/${quiz.id}`} target="_blank" rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700' })}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Informações Gerais */}
        <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-100">Informações Gerais</CardTitle>
            <CardDescription className="text-zinc-400 text-xs">Título, descrição e visibilidade do quiz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-zinc-300">Título do Quiz</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                className="border-zinc-700 bg-zinc-950 text-zinc-100" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc" className="text-zinc-300">Descrição</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
                className="border-zinc-700 bg-zinc-950 text-zinc-100 resize-none h-20" />
            </div>
            <Separator className="bg-zinc-800" />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-zinc-200 font-medium">Publicar Quiz</Label>
                <p className="text-xs text-zinc-500">Torna o link público acessível</p>
              </div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {showBranding ? <Eye className="h-4 w-4 text-zinc-500" /> : <EyeOff className="h-4 w-4 text-purple-400" />}
                <div>
                  <Label className="text-zinc-200 font-medium">Exibir marca QuizFlow</Label>
                  <p className="text-xs text-zinc-500">Desative para White-label completo</p>
                </div>
              </div>
              <Switch
                checked={showBranding}
                onCheckedChange={setShowBranding}
              />
            </div>
            {!showBranding && (
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
                <p className="text-xs text-purple-300 font-medium flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  White-label ativo — rodapé do player sem branding da plataforma.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rastreamento & Automação */}
        <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-100">Rastreamento & Automação</CardTitle>
            <CardDescription className="text-zinc-400 text-xs">Pixels, GA4 e Webhooks para suas campanhas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Meta Pixel */}
            <div className="space-y-2">
              <Label htmlFor="metaPixel" className="text-zinc-300 flex items-center justify-between">
                <span>Meta Pixel ID</span>
                <span className="text-[11px] text-zinc-500">Ex: 123456789012345</span>
              </Label>
              <Input id="metaPixel" value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)}
                placeholder="Cole o ID do Pixel do Meta Ads"
                className="border-zinc-700 bg-zinc-950 text-zinc-100" />
              <p className="text-[11px] text-zinc-500">
                Dispara <code className="bg-zinc-800 px-1 rounded text-xs">PageView</code>,{' '}
                <code className="bg-zinc-800 px-1 rounded text-xs">QuizStart</code> e{' '}
                <code className="bg-zinc-800 px-1 rounded text-xs">Lead</code> automaticamente.
              </p>
            </div>

            <Separator className="bg-zinc-800" />

            {/* GA4 */}
            <div className="space-y-2">
              <Label htmlFor="ga4" className="text-zinc-300 flex items-center justify-between">
                <span>GA4 Measurement ID</span>
                <span className="text-[11px] text-zinc-500">Ex: G-XXXXXXXXXX</span>
              </Label>
              <Input id="ga4" value={ga4MeasurementId} onChange={(e) => setGa4MeasurementId(e.target.value)}
                placeholder="G-XXXXXXXXXX"
                className="border-zinc-700 bg-zinc-950 text-zinc-100 font-mono" />
              <p className="text-[11px] text-zinc-500">
                Dispara <code className="bg-zinc-800 px-1 rounded text-xs">page_view</code> e{' '}
                <code className="bg-zinc-800 px-1 rounded text-xs">generate_lead</code> via gtag.js.
              </p>
            </div>

            <Separator className="bg-zinc-800" />

            {/* Webhook */}
            <div className="space-y-2">
              <Label htmlFor="webhook" className="text-zinc-300 flex items-center justify-between">
                <span>Webhook URL</span>
                <span className="text-[11px] text-zinc-500">POST JSON</span>
              </Label>
              <Input id="webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/..."
                className="border-zinc-700 bg-zinc-950 text-zinc-100" />
            </div>

            {/* Redirect */}
            <div className="space-y-2">
              <Label htmlFor="redirect" className="text-zinc-300">URL de Redirecionamento</Label>
              <Input id="redirect" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://seusite.com/obrigado"
                className="border-zinc-700 bg-zinc-950 text-zinc-100" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {savedSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <Check className="h-4 w-4" /> Salvo com sucesso!
          </span>
        )}
        <Button type="submit" disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 px-6">
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </div>
    </form>
  )
}
