'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'

// Archiving/unarchiving is purely a visibility flag on the agencies row —
// nothing in Stripe or Supabase auth is touched, so it's always reversible.
export async function setAgencyArchived(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const agencyId = String(formData.get('agency_id') || '').trim()
  const archived = formData.get('archived') === 'true'
  if (!agencyId) redirect('/admin')

  const admin = createAdminClient()
  await admin.from('agencies').update({ archived }).eq('id', agencyId)

  revalidatePath('/admin')
  revalidatePath('/admin/archived')
}
