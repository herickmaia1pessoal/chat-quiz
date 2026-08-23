import type { Metadata } from 'next'
import { getFunnelDraft, listFunnelVersions } from '@/app/dashboard/funnels/actions'
import {
  getFunnelIntegration,
  getFunnelWebhookDeliveries,
} from '@/app/dashboard/funnels/integration-actions'
import {
  FunnelSettingsWorkspace,
  FunnelWorkspaceShell,
  requireFunnelWorkspace,
} from '@/components/funnel-workspace'

export const metadata: Metadata = {
  title: 'Configurações | FunnelFlow',
  description: 'Identidade, SEO e aparência geral do funil.',
}

export default async function FunnelSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ funnel }, draft, integration, deliveries, versionRows] = await Promise.all([
    requireFunnelWorkspace(id),
    getFunnelDraft(id),
    getFunnelIntegration(id),
    getFunnelWebhookDeliveries(id),
    listFunnelVersions(id, 30),
  ])

  const versions = versionRows.map((version) => ({
    id: String(version.id),
    versionNumber: Number(version.version_number),
    revision: Number(version.revision),
    kind: version.kind as 'draft' | 'published' | 'restored',
    label: typeof version.label === 'string' ? version.label : null,
    sourceVersionId: typeof version.source_version_id === 'string' ? version.source_version_id : null,
    createdAt: String(version.created_at),
  }))

  return (
    <FunnelWorkspaceShell
      funnel={funnel}
      title="Configurações"
      description="Gerencie identidade, endereço público, SEO e os padrões visuais deste funil."
    >
      <FunnelSettingsWorkspace
        funnelId={id}
        currentRevision={Number(draft.revision)}
        versions={versions}
        initialIntegration={integration}
        initialDeliveries={deliveries}
        initialState={{
          revision: Number(draft.revision),
          publishedRevision: draft.publishedRevision === null ? null : Number(draft.publishedRevision),
          publishedSlug: funnel.publishedSlug,
          status: draft.status,
          document: draft.document,
        }}
      />
    </FunnelWorkspaceShell>
  )
}
