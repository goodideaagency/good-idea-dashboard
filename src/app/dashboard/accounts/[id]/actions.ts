'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setSubscriptionCancelation } from '@/lib/subscriptions'

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
