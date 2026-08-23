import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { FunnelDocument } from '@/lib/funnel'
import { PublicFunnel } from '@/components/funnel-runtime/public-funnel'
import { createClient } from '@/utils/supabase/server'

interface PublishedFunnelPayload {
  funnelId: string
  publicationId: string
  versionId: string
  slug: string
  publishedAt: string
  snapshot: FunnelDocument
}

function parsePayload(value: unknown): PublishedFunnelPayload | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || typeof candidate !== 'object') return null
  const payload = candidate as Partial<PublishedFunnelPayload>
  if (
    typeof payload.funnelId !== 'string' ||
    typeof payload.publicationId !== 'string' ||
    typeof payload.slug !== 'string' ||
    !payload.snapshot ||
    payload.snapshot.schemaVersion !== 2 ||
    !Array.isArray(payload.snapshot.pages) ||
    !Array.isArray(payload.snapshot.elements)
  ) return null
  return payload as PublishedFunnelPayload
}

function safeHttpsAsset(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

async function loadPublishedFunnel(slug: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_published_funnel', { p_slug: slug })
  if (error) return null
  return parsePayload(data)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const published = await loadPublishedFunnel(slug)
  if (!published) return { title: 'Funil não encontrado' }

  const settings = published.snapshot.settings
  const socialImage = safeHttpsAsset(settings.socialImage)
  const faviconUrl = safeHttpsAsset(settings.faviconUrl)
  return {
    title: settings.seoTitle || published.snapshot.title,
    description: settings.seoDescription || 'Uma experiência criada com FunnelFlow.',
    robots: settings.noIndex === true ? { index: false, follow: false } : undefined,
    icons: faviconUrl ? { icon: faviconUrl } : undefined,
    openGraph: socialImage ? {
      title: settings.seoTitle || published.snapshot.title,
      description: settings.seoDescription || 'Experiencia criada com FunnelFlow.',
      images: [socialImage],
    } : undefined,
  }
}

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const published = await loadPublishedFunnel(slug)
  if (!published) notFound()

  return (
    <PublicFunnel
      slug={published.slug}
      publicationId={published.publicationId}
      versionId={published.versionId}
      document={published.snapshot}
    />
  )
}
