import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { AgencySidebar } from '@/components/agency-sidebar'
import { getAgencyCreditBalance } from '@/lib/credits'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'
import { returnToAdmin } from './actions'
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

  const [{ data: membership }, { count: unreadCount }] = await Promise.all([
    supabase.from('agency_users').select('agency_id, agencies(name)').eq('user_id', user.id).maybeSingle(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  const agencyName = (membership?.agencies as { name?: string } | null)?.name ?? 'your agency'
  const agencyId = membership?.agency_id as string | undefined
  const creditBalance = agencyId ? await getAgencyCreditBalance(agencyId) : 0

  // Just a presence check for display -- returnToAdmin re-verifies the
  // token server-side before it's trusted for anything (see its own comment).
  const cookieStore = await cookies()
  const isImpersonating = Boolean(cookieStore.get(IMPERSONATION_COOKIE)?.value)

  return (
    <div className="min-h-screen">
      {isImpersonating && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-[#f7cf4a] px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-black font-mono">
          Impersonating {agencyName}
          <form action={returnToAdmin}>
            <button className="underline underline-offset-2">Return to admin</button>
          </form>
        </div>
      )}
      <div className="lg:flex">
        <AgencySidebar
          agencyName={agencyName}
          userEmail={user.email ?? ''}
          signout={signout}
          unreadCount={unreadCount ?? 0}
          creditBalance={creditBalance}
        />
        <main className="min-w-0 flex-1 bg-white">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10">{children}</div>
        </main>
      </div>
    </div>
  )
}
