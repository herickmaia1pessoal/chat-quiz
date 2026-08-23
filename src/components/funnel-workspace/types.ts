import type { FunnelDocument } from '@/lib/funnel/types'

export type FunnelWorkspaceStatus = 'draft' | 'published' | 'archived'

export interface FunnelWorkspaceMeta {
  id: string
  name: string
  slug: string
  publishedSlug: string | null
  status: FunnelWorkspaceStatus
  draftRevision: number
  publishedRevision: number | null
}

export interface FunnelSubmissionValueRecord {
  id: number
  submissionId: string
  fieldKey: string
  value: unknown
  createdAt: string
}

export interface FunnelSubmissionRecord {
  id: string
  sessionId: string
  name: string | null
  email: string | null
  phone: string | null
  lead: Record<string, unknown>
  score: number | null
  resultKey: string | null
  tags: string[]
  submittedAt: string
  values: FunnelSubmissionValueRecord[]
}

export interface FunnelPageAnalytics {
  id: string
  name: string
  order: number
  visits: number
  abandonments: number
  abandonmentRate: number
}

export interface FunnelAnalyticsData {
  visits: number
  starts: number
  completions: number
  conversionRate: number
  abandonments: number
  pageAnalytics: FunnelPageAnalytics[]
  daily: Array<{
    date: string
    label: string
    starts: number
    completions: number
  }>
  sampled: boolean
}

export interface FunnelSettingsState {
  revision: number
  publishedRevision: number | null
  publishedSlug: string | null
  status: FunnelWorkspaceStatus
  document: FunnelDocument
}

export interface FunnelIntegrationState {
  webhookEnabled: boolean
  webhookUrl: string
  hasWebhookSecret: boolean
  secretPreview: string | null
  updatedAt: string | null
}

export interface FunnelWebhookDeliveryRecord {
  id: string
  status: 'pending' | 'processing' | 'retrying' | 'succeeded' | 'failed'
  attemptCount: number
  statusCode: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
}

export interface FunnelVersionRecord {
  id: string
  versionNumber: number
  revision: number
  kind: 'draft' | 'published' | 'restored'
  label: string | null
  sourceVersionId: string | null
  createdAt: string
}
