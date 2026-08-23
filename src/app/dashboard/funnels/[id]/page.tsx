import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FunnelBuilder } from '@/components/funnel-builder'
import { createClient } from '@/utils/supabase/server'
import {
  getFunnelDraft,
  publishFunnelFromBuilder,
  saveFunnelDraftFromBuilder,
} from '../actions'

export const metadata: Metadata = {
  title: 'Funnel Builder V2',
  description: 'Editor visual responsivo de funis e formulários.',
}

export default async function FunnelBuilderPage({
  params,
}: PageProps<'/dashboard/funnels/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound()

  const draft = await getFunnelDraft(id)

  // workspace_id isn't part of the get_funnel_draft RPC payload — fetched
  // separately so the Inspector's media picker knows which Storage prefix
  // (`${workspaceId}/${funnelId}`) to browse. RLS already scoped
  // getFunnelDraft's access check, so this plain select is safe.
  const supabase = await createClient()
  const { data: funnelRow } = await supabase.from('funnels').select('workspace_id').eq('id', id).single()

  return (
    <FunnelBuilder
      initialDocument={draft.document}
      initialRevision={Number(draft.revision)}
      initialPublished={draft.publishedRevision !== null && Number(draft.publishedRevision) === Number(draft.revision)}
      workspaceId={funnelRow?.workspace_id}
      onSaveDraft={saveFunnelDraftFromBuilder}
      onPublish={publishFunnelFromBuilder}
    />
  )
}
