import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FunnelBuilder } from '@/components/funnel-builder'
import { createClient } from '@/utils/supabase/server'
import {
  getFunnelDraft,
  publishFunnelFromBuilder,
  saveFunnelDraftFromBuilder,
} from '../../actions'

export const metadata: Metadata = {
  title: 'Fluxo | Funnel Builder V2',
  description: 'Editor visual do fluxo de paginas do funil.',
}

export default async function FunnelFlowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound()

  const draft = await getFunnelDraft(id)

  const supabase = await createClient()
  const { data: funnelRow } = await supabase.from('funnels').select('workspace_id').eq('id', id).single()

  return (
    <FunnelBuilder
      initialDocument={draft.document}
      initialRevision={Number(draft.revision)}
      initialMode="flow"
      initialPublished={draft.publishedRevision !== null && Number(draft.publishedRevision) === Number(draft.revision)}
      workspaceId={funnelRow?.workspace_id}
      onSaveDraft={saveFunnelDraftFromBuilder}
      onPublish={publishFunnelFromBuilder}
    />
  )
}
