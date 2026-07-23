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

  const [{ data: membership }, { data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase.from('agency_users').select('agencies(name)').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('notifications')
      .select('id, title, body, url, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  const agencyName = (membership?.agencies as { name?: string } | null)?.name ?? 'your agency'

  return (
    <div className="flex min-h-screen">
      <AgencySidebar
        agencyName={agencyName}
        userEmail={user.email ?? ''}
        signout={signout}
        notifications={notifications ?? []}
        unreadCount={unreadCount ?? 0}
      />
      <main className="min-w-0 flex-1 bg-white">{children}</main>
    </div>
  )
}
