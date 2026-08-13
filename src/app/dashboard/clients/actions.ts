'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createList, createTask, setClientStatus } from '@/lib/clickup'

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
  // Only ever set by our own pages to a relative in-app path (e.g. back to
  // the service request form this was opened from) -- reject anything else
  // so this can't become an open redirect.
  const rawNext = String(formData.get('next') || '')
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null
  // Where to land once the profile exists: back where the user came from
  // (with the new account preselected) if we know it, otherwise the
  // profile's own page like before. Without this, starting a service
  // request, realizing the client isn't set up yet, and creating them mid-
  // flow used to strand the user on the profile page with no way back into
  // the request except starting over from scratch.
  const destination = (accountId: string) =>
    next
      ? `${next}${next.includes('?') ? '&' : '?'}account_id=${accountId}`
      : `/dashboard/clients/${accountId}`

  if (!name) {
    redirect(
      `/dashboard/clients/new?${next ? `next=${encodeURIComponent(next)}&` : ''}error=` +
        encodeURIComponent('Please enter a client name.')
    )
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

  // Idempotency: a double-click or resubmit on this form would otherwise
  // create a second empty account + ClickUp List every time, since nothing
  // unique exists yet to check against (no payment/subscription involved
  // here at all). Reuse a very recently created account with the same name
  // for this agency instead of creating another one.
  const { data: recent } = await admin
    .from('accounts')
    .select('id')
    .eq('agency_id', agency.id)
    .ilike('name', name)
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recent) redirect(destination(recent.id))

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
      const profileTask = await createTask(profilesListId, `Client Profile — ${name}`, {
        description: details,
      })
      if (profileTask) {
        await admin.from('accounts').update({ clickup_profile_task_id: profileTask.id }).eq('id', account.id)
        await setClientStatus(profilesListId, profileTask.id, false)
      }
    }
  }

  revalidatePath('/dashboard/clients')
  redirect(destination(account.id))
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

// Archiving only flips a Supabase flag -- the client's ClickUp List, tasks,
// and files all stay exactly where they are, so restoring un-hides
// everything again instantly. The one ClickUp-visible trace is the Client
// Status field on their Client Profile reference task, kept in sync here so
// the team can see active/archived without leaving ClickUp. Archived
// clients still work fine on direct links; they're only hidden from the
// main My Clients list and from the account picker when starting new work.
export async function setAccountArchived(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = String(formData.get('account_id') || '').trim()
  const archived = formData.get('archived') === 'true'
  if (!accountId) redirect('/dashboard/clients')

  const { data: owned } = await supabase
    .from('accounts')
    .select('id, agency_id, clickup_profile_task_id')
    .eq('id', accountId)
    .maybeSingle()
  if (!owned) redirect('/dashboard/clients')

  const admin = createAdminClient()
  await admin.from('accounts').update({ archived }).eq('id', accountId)

  if (owned.clickup_profile_task_id) {
    const { data: agency } = await admin
      .from('agencies')
      .select('clickup_profiles_list_id')
      .eq('id', owned.agency_id)
      .maybeSingle()
    if (agency?.clickup_profiles_list_id) {
      await setClientStatus(agency.clickup_profiles_list_id, owned.clickup_profile_task_id, archived)
    }
  }

  revalidatePath(`/dashboard/clients/${accountId}`)
  revalidatePath('/dashboard/clients')
}
