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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  const [identityField, setIdentityField] = useState(quiz.identity_field || 'none')
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
        identity_field: identityField,
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
      <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Link Público do Player:</span>
            {isPublished ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                Online & Pronto para Tráfego
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                Rascunho (Privado)
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground truncate max-w-md">{publicUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm"
            onClick={handleCopyLink}
            className="border-border bg-muted text-foreground hover:bg-accent gap-1.5">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar Link'}
          </Button>
          <a href={`/q/${quiz.id}`} target="_blank" rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'border-border bg-muted text-foreground hover:bg-accent' })}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Informações Gerais */}
        <Card className="border-border bg-card backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Informações Gerais</CardTitle>
            <CardDescription className="text-muted-foreground text-xs">Título, descrição e visibilidade do quiz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-muted-foreground">Título do Quiz</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                className="border-border bg-muted/50 text-foreground" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc" className="text-muted-foreground">Descrição</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
                className="border-border bg-muted/50 text-foreground resize-none h-20" />
            </div>
            <Separator className="bg-muted" />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-foreground font-medium">Publicar Quiz</Label>
                <p className="text-xs text-muted-foreground">Torna o link público acessível</p>
              </div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {showBranding ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-purple-400" />}
                <div>
                  <Label className="text-foreground font-medium">Exibir marca QuizFlow</Label>
                  <p className="text-xs text-muted-foreground">Desative para White-label completo</p>
                </div>
              </div>
              <Switch
                checked={showBranding}
                onCheckedChange={setShowBranding}
              />
            </div>
            {!showBranding && (
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
                <p className="text-xs text-purple-700 font-medium flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  White-label ativo — rodapé do player sem branding da plataforma.
                </p>
              </div>
            )}

            <Separator className="bg-muted" />

            <div className="space-y-2">
              <Label className="text-muted-foreground">Tipo de Identidade do Lead</Label>
              <Select value={identityField} onValueChange={setIdentityField}>
                <SelectTrigger className="border-border bg-muted/50 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-card text-foreground">
                  <SelectItem value="none">Nenhuma (cada envio é um lead novo)</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="name">Nome Completo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Se a mesma pessoa responder de novo, a sessão existente é atualizada em vez de virar um lead duplicado — evita inflar as métricas de conversão.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Rastreamento & Automação */}
        <Card className="border-border bg-card backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Rastreamento & Automação</CardTitle>
            <CardDescription className="text-muted-foreground text-xs">Pixels, GA4 e Webhooks para suas campanhas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Meta Pixel */}
            <div className="space-y-2">
              <Label htmlFor="metaPixel" className="text-muted-foreground flex items-center justify-between">
                <span>Meta Pixel ID</span>
                <span className="text-[11px] text-muted-foreground">Ex: 123456789012345</span>
              </Label>
              <Input id="metaPixel" value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)}
                placeholder="Cole o ID do Pixel do Meta Ads"
                className="border-border bg-muted/50 text-foreground" />
              <p className="text-[11px] text-muted-foreground">
                Dispara <code className="bg-muted px-1 rounded text-xs">PageView</code>,{' '}
                <code className="bg-muted px-1 rounded text-xs">QuizStart</code> e{' '}
                <code className="bg-muted px-1 rounded text-xs">Lead</code> automaticamente.
              </p>
            </div>

            <Separator className="bg-muted" />

            {/* GA4 */}
            <div className="space-y-2">
              <Label htmlFor="ga4" className="text-muted-foreground flex items-center justify-between">
                <span>GA4 Measurement ID</span>
                <span className="text-[11px] text-muted-foreground">Ex: G-XXXXXXXXXX</span>
              </Label>
              <Input id="ga4" value={ga4MeasurementId} onChange={(e) => setGa4MeasurementId(e.target.value)}
                placeholder="G-XXXXXXXXXX"
                className="border-border bg-muted/50 text-foreground font-mono" />
              <p className="text-[11px] text-muted-foreground">
                Dispara <code className="bg-muted px-1 rounded text-xs">page_view</code> e{' '}
                <code className="bg-muted px-1 rounded text-xs">generate_lead</code> via gtag.js.
              </p>
            </div>

            <Separator className="bg-muted" />

            {/* Webhook */}
            <div className="space-y-2">
              <Label htmlFor="webhook" className="text-muted-foreground flex items-center justify-between">
                <span>Webhook URL</span>
                <span className="text-[11px] text-muted-foreground">POST JSON</span>
              </Label>
              <Input id="webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/..."
                className="border-border bg-muted/50 text-foreground" />
            </div>

            {/* Redirect */}
            <div className="space-y-2">
              <Label htmlFor="redirect" className="text-muted-foreground">URL de Redirecionamento</Label>
              <Input id="redirect" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://seusite.com/obrigado"
                className="border-border bg-muted/50 text-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {savedSuccess && (
          <span className="text-xs text-emerald-500 flex items-center gap-1">
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
