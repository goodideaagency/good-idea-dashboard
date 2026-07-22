'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setSubscriptionCancelation } from '@/lib/subscriptions'
import { getTaskListId, postTaskComment } from '@/lib/clickup'

// Agency-side cancel / restart. Ownership is enforced by RLS: the account (and
// its nested subscription) is only returned if it belongs to the caller's agency.
export async function updateSubscriptionState(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const subscriptionId = String(formData.get('subscription_id') || '').trim()
  const accountId = String(formData.get('account_id') || '').trim()
  const intent = String(formData.get('intent') || '').trim()
  if (!subscriptionId || !accountId) redirect('/dashboard')

  const { data: account } = await supabase
    .from('accounts')
    .select('id, subscriptions(stripe_subscription_id)')
    .eq('id', accountId)
    .maybeSingle<{ id: string; subscriptions: { stripe_subscription_id: string | null }[] }>()

  const owns = account?.subscriptions?.some(
    (s) => s.stripe_subscription_id === subscriptionId
  )
  if (!owns) redirect('/dashboard')

  await setSubscriptionCancelation(subscriptionId, intent === 'cancel')
  revalidatePath(`/dashboard/accounts/${accountId}`)
}

// Posts a client's comment onto a ClickUp task, labeled with their own email
// so it's clear who actually wrote it (the ClickUp comment itself is always
// authored by the app's shared service token). Verifies the task really
// belongs to THIS account's connected List before posting, so a client can
// never comment onto another client's task even by guessing a task id.
export async function postAccountTaskComment(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const accountId = String(formData.get('account_id') || '').trim()
  const taskId = String(formData.get('task_id') || '').trim()
  const text = String(formData.get('text') || '').trim()
  if (!accountId || !taskId || !text) redirect('/dashboard')

  // RLS ensures this only returns the account if it belongs to the caller's agency.
  const { data: account } = await supabase
    .from('accounts')
    .select('id, clickup_list_id')
    .eq('id', accountId)
    .maybeSingle<{ id: string; clickup_list_id: string | null }>()
  if (!account?.clickup_list_id) redirect('/dashboard')

  const taskListId = await getTaskListId(taskId)
  if (taskListId !== account.clickup_list_id) redirect(`/dashboard/accounts/${accountId}`)

  await postTaskComment(taskId, user.email ?? 'Client', text)
  revalidatePath(`/dashboard/accounts/${accountId}`)
}
