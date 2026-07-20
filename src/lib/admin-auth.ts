import { createAdminClient } from '@/lib/supabase/admin'

export type AdminRole = 'superadmin' | 'admin'

// The master account, from the environment. Always has superadmin access even
// if the database row were ever removed — so you can never lock yourself out.
function superadminEmail(): string {
  return (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase()
}

// Returns the admin role for an email, or null if they are not an admin.
export async function getAdminRole(email?: string | null): Promise<AdminRole | null> {
  if (!email) return null
  const e = email.trim().toLowerCase()
  if (e && e === superadminEmail()) return 'superadmin'

  const admin = createAdminClient()
  const { data } = await admin.from('admins').select('role').eq('email', e).maybeSingle()
  return (data?.role as AdminRole) ?? null
}

export async function isAdmin(email?: string | null): Promise<boolean> {
  return (await getAdminRole(email)) !== null
}

export async function isSuperadmin(email?: string | null): Promise<boolean> {
  return (await getAdminRole(email)) === 'superadmin'
}
