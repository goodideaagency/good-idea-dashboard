'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'

// Marks a recovered submission as handled once an admin has manually
// followed up (re-entered it into ClickUp, or reached out to the client) --
// see lib/intake-submissions.ts for how these rows get created.
export async function dismissIntakeSubmission(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')
  if (!(await isAdmin(user.email))) redirect('/dashboard')

  const id = String(formData.get('id') || '').trim()
  if (!id) redirect('/admin/intake-recovery')

  const admin = createAdminClient()
  await admin.from('intake_submissions').update({ status: 'dismissed' }).eq('id', id)
  revalidatePath('/admin/intake-recovery')
}
