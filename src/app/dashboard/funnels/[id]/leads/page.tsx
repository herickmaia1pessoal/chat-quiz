import type { Metadata } from 'next'
import { FunnelWorkspaceShell, LeadsClient, getFunnelSubmissions } from '@/components/funnel-workspace'

export const metadata: Metadata = {
  title: 'Leads | FunnelFlow',
  description: 'Leads e respostas recebidas pelo funil.',
}

export default async function FunnelLeadsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { funnel, submissions, truncated } = await getFunnelSubmissions(id)

  return (
    <FunnelWorkspaceShell
      funnel={funnel}
      title="Leads"
      description="Consulte contatos, resultados e todas as respostas enviadas neste funil."
    >
      <LeadsClient funnelName={funnel.name} submissions={submissions} truncated={truncated} />
    </FunnelWorkspaceShell>
  )
}
