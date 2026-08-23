import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard-v2/dashboard-shell'
import { createClient } from '@/utils/supabase/server'

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, name')
    .order('created_at', { ascending: true })

  // Preserve the existing onboarding behavior while keeping the shell usable
  // when a workspace cannot be created (for example, while migrations are
  // still being applied in a preview environment).
  if (!workspaces || workspaces.length === 0) {
    const { data: newWorkspace } = await supabase
      .from('workspaces')
      .insert({
        name: 'Meu Workspace',
        owner_id: user.id,
      })
      .select('id, name')
      .single()

    if (newWorkspace) workspaces = [newWorkspace]
  }

  return (
    <DashboardShell workspaces={workspaces || []} userEmail={user.email || 'Conta FunnelFlow'}>
      {children}
    </DashboardShell>
  )
}
