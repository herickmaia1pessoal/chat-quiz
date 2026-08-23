import { redirect } from 'next/navigation'
import {
  DashboardHome,
  type DashboardViewName,
  type FunnelSummary,
  type LegacyQuizSummary,
  type LegacyTemplateSummary,
  type FunnelTemplateSummary,
} from '@/components/dashboard-v2/dashboard-home'
import { createClient } from '@/utils/supabase/server'

type SearchParams = Promise<{
  ws?: string | string[]
  view?: string | string[]
}>

interface RawFunnel {
  id: string
  name: string
  slug: string
  status: string
  draft_revision: number | null
  published_version_id: string | null
  created_at: string
  updated_at: string
  pages: Array<{ count: number }> | null
  submissions: Array<{ count: number }> | null
}

interface RawActivePublication {
  funnel_id: string
  slug: string
}

interface RawQuiz {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
  questions: Array<{ count: number }> | null
  leads: Array<{ count: number }> | null
}

interface RawTemplate {
  id: string
  name: string
  description: string | null
  category: string
  thumbnail_emoji: string | null
}

interface RawFunnelTemplate {
  id: string
  name: string
  description: string | null
  category: string
  created_at: string
  source_funnel_id: string | null
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseView(value: string | undefined): DashboardViewName {
  if (value === 'funnels' || value === 'templates' || value === 'media' || value === 'legacy' || value === 'settings') return value
  return 'overview'
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const params = await searchParams
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: workspaceRows }, { data: templateRows }] = await Promise.all([
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase
      .from('quiz_templates')
      .select('id, name, description, category, thumbnail_emoji')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ])

  const workspaces = workspaceRows || []
  const requestedWorkspaceId = firstParam(params.ws)
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === requestedWorkspaceId) || workspaces[0]
  const activeWorkspaceId = activeWorkspace?.id

  let rawQuizzes: RawQuiz[] = []
  let rawFunnels: RawFunnel[] = []
  let rawActivePublications: RawActivePublication[] = []
  let rawFunnelTemplates: RawFunnelTemplate[] = []
  let funnelDataAvailable = true

  if (activeWorkspaceId) {
    const [quizResult, funnelResult, publicationResult, funnelTemplateResult] = await Promise.all([
      supabase
        .from('quizzes')
        .select(`
          id,
          title,
          description,
          status,
          created_at,
          updated_at,
          questions:questions(count),
          leads:leads_responses(count)
        `)
        .eq('workspace_id', activeWorkspaceId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('funnels')
        .select(`
          id,
          name,
          slug,
          status,
          draft_revision,
          published_version_id,
          created_at,
          updated_at,
          pages:funnel_pages(count),
          submissions:funnel_submissions(count)
        `)
        .eq('workspace_id', activeWorkspaceId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('funnel_publications')
        .select('funnel_id, slug')
        .eq('is_active', true),
      supabase
        .from('funnel_templates')
        .select('id, name, description, category, created_at, source_funnel_id')
        .eq('workspace_id', activeWorkspaceId)
        .order('updated_at', { ascending: false }),
    ])

    rawQuizzes = (quizResult.data || []) as RawQuiz[]
    if (funnelResult.error) {
      // The dashboard can be deployed before the V2 migration. Legacy projects
      // remain fully usable instead of turning a missing table into a 500 page.
      funnelDataAvailable = false
    } else {
      rawFunnels = (funnelResult.data || []) as RawFunnel[]
      if (!publicationResult.error) {
        const funnelIds = new Set(rawFunnels.map((funnel) => funnel.id))
        rawActivePublications = ((publicationResult.data || []) as RawActivePublication[])
          .filter((publication) => funnelIds.has(publication.funnel_id))
      }
    }
    if (!funnelTemplateResult.error) {
      rawFunnelTemplates = (funnelTemplateResult.data || []) as RawFunnelTemplate[]
    }
  }

  const quizIds = rawQuizzes.map((quiz) => quiz.id)
  const completedLegacyResult = await (
    quizIds.length > 0
      ? supabase
          .from('leads_responses')
          .select('id', { count: 'exact', head: true })
          .in('quiz_id', quizIds)
          .eq('status', 'completed')
      : Promise.resolve({ count: 0 })
  )

  const activePublications = new Map(rawActivePublications.map((publication) => [publication.funnel_id, publication.slug]))
  const funnels: FunnelSummary[] = rawFunnels.map((funnel) => ({
    id: funnel.id,
    name: funnel.name,
    slug: funnel.slug,
    publishedSlug: activePublications.get(funnel.id) ?? null,
    status: funnel.status === 'published' && activePublications.has(funnel.id)
      ? 'published'
      : funnel.status === 'archived' ? 'archived' : 'draft',
    createdAt: funnel.created_at,
    updatedAt: funnel.updated_at,
    draftRevision: funnel.draft_revision || 1,
    publishedVersionId: activePublications.has(funnel.id) ? funnel.published_version_id : null,
    pageCount: funnel.pages?.[0]?.count || 0,
    submissionCount: funnel.submissions?.[0]?.count || 0,
  }))

  const legacyQuizzes: LegacyQuizSummary[] = rawQuizzes.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    status: quiz.status,
    createdAt: quiz.created_at,
    updatedAt: quiz.updated_at,
    questionCount: quiz.questions?.[0]?.count || 0,
    leadCount: quiz.leads?.[0]?.count || 0,
  }))

  const templates: LegacyTemplateSummary[] = ((templateRows || []) as RawTemplate[]).map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description || '',
    category: template.category,
    thumbnail_emoji: template.thumbnail_emoji || '📋',
  }))

  const funnelTemplates: FunnelTemplateSummary[] = rawFunnelTemplates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description || '',
    category: template.category,
    createdAt: template.created_at,
    sourceFunnelId: template.source_funnel_id,
  }))

  const totalLegacyLeads = legacyQuizzes.reduce((total, quiz) => total + quiz.leadCount, 0)

  return (
    <DashboardHome
      view={parseView(firstParam(params.view))}
      workspaceId={activeWorkspaceId}
      workspaceName={activeWorkspace?.name || 'Sem workspace'}
      workspaces={workspaces}
      userEmail={user.email || 'Conta FunnelFlow'}
      funnels={funnels}
      legacyQuizzes={legacyQuizzes}
      templates={templates}
      funnelTemplates={funnelTemplates}
      totalLegacyLeads={totalLegacyLeads}
      totalLegacyCompleted={completedLegacyResult.count || 0}
      funnelDataAvailable={funnelDataAvailable}
    />
  )
}
