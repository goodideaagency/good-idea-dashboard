'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createList, createTask } from '@/lib/clickup'

// Creates a Client Profile -- no payment involved. If the agency's ClickUp
// Folder is connected, this also auto-provisions the client's own ClickUp
// List (so your team sees it immediately) and drops a "Client Profile" task
// into the agency's dedicated Client Profiles List -- NOT the client's own
// List -- so it's a reference record for your team, not something that
// shows up as a project to work on anywhere in the app or Internal Ops.
export async function createClientProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()
  if (!name) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent('Please enter a client name.'))
  }

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard/clients')

  const admin = createAdminClient()
  const { data: agency } = await admin
    .from('agencies')
    .select('id, clickup_folder_id, clickup_profiles_list_id')
    .eq('id', membership.agency_id)
    .single()
  if (!agency) redirect('/dashboard/clients')

  const { data: account } = await admin
    .from('accounts')
    .insert({ agency_id: agency.id, name, website: website || null })
    .select('id')
    .single()
  if (!account) redirect('/dashboard/clients')

  if (agency.clickup_folder_id) {
    const list = await createList(agency.clickup_folder_id, name)
    if (list) {
      await admin.from('accounts').update({ clickup_list_id: list.id }).eq('id', account.id)
    }

    let profilesListId = agency.clickup_profiles_list_id
    if (!profilesListId) {
      const profilesList = await createList(agency.clickup_folder_id, 'Client Profiles')
      if (profilesList) {
        profilesListId = profilesList.id
        await admin.from('agencies').update({ clickup_profiles_list_id: profilesList.id }).eq('id', agency.id)
      }
    }

    if (profilesListId) {
      const details = website ? `Website: ${website}` : undefined
      await createTask(profilesListId, `Client Profile — ${name}`, { description: details })
    }
  }

  revalidatePath('/dashboard/clients')
  redirect(`/dashboard/clients/${account.id}`)
}

// Updates a Client Profile's basic info. RLS on the select ensures the
// account belongs to the caller's own agency before the update is applied.
export async function updateClientProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = String(formData.get('account_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()
  if (!accountId || !name) redirect('/dashboard/clients')

  const { data: owned } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .maybeSingle()
  if (!owned) redirect('/dashboard/clients')

  const admin = createAdminClient()
  await admin.from('accounts').update({ name, website: website || null }).eq('id', accountId)

  revalidatePath(`/dashboard/clients/${accountId}`)
  revalidatePath('/dashboard/clients')
}
