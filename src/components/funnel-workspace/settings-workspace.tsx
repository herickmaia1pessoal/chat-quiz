'use client'

import { useCallback, useState } from 'react'
import { useUnsavedChangesGuard } from '@/lib/use-unsaved-changes-guard'
import type {
  FunnelIntegrationState,
  FunnelSettingsState,
  FunnelVersionRecord,
  FunnelWebhookDeliveryRecord,
} from './types'
import { FunnelSettingsForm } from './settings-form'
import { FunnelVersionHistory } from './version-history'

interface FunnelSettingsWorkspaceProps {
  funnelId: string
  currentRevision: number
  versions: FunnelVersionRecord[]
  initialState: FunnelSettingsState
  initialIntegration: FunnelIntegrationState
  initialDeliveries: FunnelWebhookDeliveryRecord[]
}

export function FunnelSettingsWorkspace(props: FunnelSettingsWorkspaceProps) {
  const [dirty, setDirty] = useState(false)
  const message = 'Existem configuracoes nao salvas. Deseja descarta-las e continuar?'
  const confirmDiscard = useUnsavedChangesGuard(dirty, message)
  const confirmRestore = useCallback(() => {
    const confirmed = confirmDiscard()
    if (confirmed) setDirty(false)
    return confirmed
  }, [confirmDiscard])

  return (
    <>
      <FunnelSettingsForm
        initialState={props.initialState}
        initialIntegration={props.initialIntegration}
        initialDeliveries={props.initialDeliveries}
        onDirtyChange={setDirty}
      />
      <FunnelVersionHistory
        funnelId={props.funnelId}
        currentRevision={props.currentRevision}
        versions={props.versions}
        confirmRestore={confirmRestore}
      />
    </>
  )
}
