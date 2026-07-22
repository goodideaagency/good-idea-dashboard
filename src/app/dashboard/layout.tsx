import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AgencySidebar } from '@/components/agency-sidebar'
import { signout } from '../login/actions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agencies(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  const agencyName = (membership?.agencies as { name?: string } | null)?.name ?? 'your agency'

  return (
    <div className="flex min-h-screen">
      <AgencySidebar agencyName={agencyName} userEmail={user.email ?? ''} signout={signout} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
