'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperadmin } from '@/lib/admin-auth'

// Only the superadmin may add or remove approved admins.
async function requireSuperadmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return isSuperadmin(user?.email)
}

export async function addAdmin(formData: FormData) {
  if (!(await requireSuperadmin())) return

  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()
  if (!email || !email.includes('@')) return

  const admin = createAdminClient()
  // ignoreDuplicates so we never downgrade an existing superadmin to 'admin'.
  await admin
    .from('admins')
    .upsert({ email, role: 'admin' }, { onConflict: 'email', ignoreDuplicates: true })

  revalidatePath('/admin/admins')
}

export async function removeAdmin(formData: FormData) {
  if (!(await requireSuperadmin())) return

  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()
  if (!email) return

  const admin = createAdminClient()
  // Never remove a superadmin via this action.
  await admin.from('admins').delete().eq('email', email).eq('role', 'admin')

  revalidatePath('/admin/admins')
}
