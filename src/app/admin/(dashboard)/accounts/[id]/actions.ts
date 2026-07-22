'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin-auth'
import { setSubscriptionCancelation } from '@/lib/subscriptions'

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
