'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'

// Creates an agency + its owner login, and returns a one-time invite link the
// admin can send so the owner can set their password.
export async function createAgency(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()

  const back = (q: string): never => redirect('/admin/new-agency?' + q)

  if (!name || !email || !email.includes('@')) {
    back('error=' + encodeURIComponent('Enter an agency name and a valid owner email.'))
  }

  const admin = createAdminClient()

  // 1. Create the agency.
  const { data: agency, error: agErr } = await admin
    .from('agencies')
    .insert({ name })
    .select('id')
    .single()
  if (agErr || !agency) {
    back('error=' + encodeURIComponent(agErr?.message ?? 'Could not create the agency.'))
  }

  // 2. Create the owner login + an invite link (the trigger attaches them to
  //    this agency via the agency_id in metadata).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { agency_id: agency!.id } },
  })

  const hashedToken = linkData?.properties?.hashed_token
  if (linkErr || !hashedToken) {
    // Roll back the agency we just created so we don't leave an orphan.
    await admin.from('agencies').delete().eq('id', agency!.id)
    back('error=' + encodeURIComponent(linkErr?.message ?? 'Could not create the owner login.'))
  }

  const origin =
    (await headers()).get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  const inviteUrl = `${origin}/auth/confirm?token_hash=${hashedToken}&type=invite&next=/set-password`

  back(
    'invite=' +
      encodeURIComponent(inviteUrl) +
      '&agency=' +
      encodeURIComponent(name) +
      '&email=' +
      encodeURIComponent(email)
  )
}
