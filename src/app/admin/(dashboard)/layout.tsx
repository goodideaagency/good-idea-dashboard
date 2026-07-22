import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminRole } from '@/lib/admin-auth'
import { AdminSidebar } from '@/components/admin-sidebar'
import { signout } from '../../login/actions'

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
  const role = await getAdminRole(user.email)
  if (!role) redirect('/dashboard')

  const admin = createAdminClient()
  const { count } = await admin
    .from('agencies')
    .select('id', { count: 'exact', head: true })
    .eq('archived', true)

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        email={user.email ?? ''}
        isSuperadmin={role === 'superadmin'}
        archivedCount={count ?? 0}
        signout={signout}
      />
      <main className="min-w-0 flex-1 bg-white">{children}</main>
    </div>
  )
}
