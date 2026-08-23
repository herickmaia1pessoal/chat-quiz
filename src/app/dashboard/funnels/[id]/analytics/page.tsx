import type { Metadata } from 'next'
import { AnalyticsView, FunnelWorkspaceShell, getFunnelAnalytics } from '@/components/funnel-workspace'

export const metadata: Metadata = {
  title: 'Analytics | FunnelFlow',
  description: 'Visitas, inícios por interação, conversão e abandono do funil.',
}

export default async function FunnelAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { funnel, analytics } = await getFunnelAnalytics(id)

  return (
    <FunnelWorkspaceShell
      funnel={funnel}
      title="Analytics"
      description="Acompanhe visitas, inícios por interação, conclusões e os pontos de abandono da experiência publicada."
    >
      <AnalyticsView analytics={analytics} />
    </FunnelWorkspaceShell>
  )
}
