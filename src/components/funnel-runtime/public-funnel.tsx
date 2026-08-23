'use client'

import type { FunnelDocument } from '@/lib/funnel'
import {
  saveFunnelRuntimeProgress,
  startFunnelRuntime,
  submitFunnelRuntime,
  trackFunnelRuntimeEvent,
} from '@/app/f/[slug]/actions'
import { FunnelPlayer } from './funnel-player'
import { FunnelTrackingScripts } from './tracking-scripts'

export function PublicFunnel({
  slug,
  publicationId,
  versionId,
  document,
}: {
  slug: string
  publicationId: string
  versionId: string
  document: FunnelDocument
}) {
  return (
    <>
      <FunnelTrackingScripts settings={document.settings} />
      <FunnelPlayer
        document={document}
        publicationId={publicationId}
        onStart={(context) => startFunnelRuntime(slug, publicationId, versionId, context)}
        onEvent={(context, event) => trackFunnelRuntimeEvent(slug, context, event)}
        onProgress={(context, pageId, pagePath, values) => saveFunnelRuntimeProgress(slug, context, pageId, pagePath, values)}
        onSubmit={(context, pageId, pagePath, values) => submitFunnelRuntime(slug, context, pageId, pagePath, values)}
      />
    </>
  )
}
