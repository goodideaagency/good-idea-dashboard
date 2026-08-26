'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { setSubscriptionCancelation } from '@/lib/subscriptions'
import { deleteList, deleteTask } from '@/lib/clickup'

// Admin-side cancel / restart for any agency's subscription.
export async function updateSubscriptionStateAdmin(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const subscriptionId = String(formData.get('subscription_id') || '').trim()
  const accountId = String(formData.get('account_id') || '').trim()
  const intent = String(formData.get('intent') || '').trim()
  if (!subscriptionId) redirect('/admin')

  await setSubscriptionCancelation(subscriptionId, intent === 'cancel')
  if (accountId) revalidatePath(`/admin/accounts/${accountId}`)
}

// Connects (or disconnects) the ClickUp List that this account's Project
// section pulls tasks from. Just a reference id — nothing in ClickUp itself
// is touched.
export async function updateAccountClickupList(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const accountId = String(formData.get('account_id') || '').trim()
  const clickupListId = String(formData.get('clickup_list_id') || '').trim()
  if (!accountId) redirect('/admin')

  const admin = createAdminClient()
  await admin
    .from('accounts')
    .update({ clickup_list_id: clickupListId || null })
    .eq('id', accountId)

  revalidatePath(`/admin/accounts/${accountId}`)
}

// Permanently deletes a client profile -- for leftover build/migration
// artifacts that never represented a real client relationship (e.g. an
// account created directly against Stripe/ClickUp during early
// development). Any subscription still pointed at this account -- credit
// plans especially, which aren't really "for" one client -- is only
// unlinked (account_id -> null via the FK's on delete set null), never
// canceled: deleting a client profile must never silently stop billing or
// drop credits out from under the agency. ClickUp cleanup is best-effort
// and doesn't block the deletion -- the admin may have already
// removed the List/task by hand (confirmed live: a 404 there is treated as
// already-done, not a failure).
export async function deleteAccount(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.email))) redirect('/dashboard')

  const accountId = String(formData.get('account_id') || '').trim()
  if (!accountId) redirect('/admin')

  const admin = createAdminClient()
  const { data: account } = await admin
    .from('accounts')
    .select('agency_id, clickup_list_id, clickup_profile_task_id')
    .eq('id', accountId)
    .maybeSingle()
  if (!account) redirect('/admin')

  if (account.clickup_list_id) await deleteList(account.clickup_list_id)
  if (account.clickup_profile_task_id) await deleteTask(account.clickup_profile_task_id)

  await admin.from('accounts').delete().eq('id', accountId)

  revalidatePath(`/admin/agencies/${account.agency_id}`)
  redirect(`/admin/agencies/${account.agency_id}`)
}
