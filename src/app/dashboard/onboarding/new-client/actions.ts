'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { createList } from '@/lib/clickup'

// Creates the first client account for a just-signed-up managed-service
// agency (business info was deliberately deferred until after payment --
// see the signup flow), auto-provisions its ClickUp List the same way any
// other new account would get one, and attaches it to the subscription that
// was created with no account yet at checkout time. Hands off to the
// existing per-service intake form to finish setup.
export async function completeNewClientSetup(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const priceId = String(formData.get('price_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()
  if (!priceId) redirect('/dashboard')
  if (!name) {
    redirect(
      `/dashboard/onboarding/new-client?price_id=${encodeURIComponent(priceId)}&error=` +
        encodeURIComponent('Business name is required.')
    )
  }

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: agency } = await admin
    .from('agencies')
    .select('id, clickup_folder_id')
    .eq('id', membership.agency_id)
    .maybeSingle()
  if (!agency) redirect('/dashboard')

  const { data: account } = await admin
    .from('accounts')
    .insert({ agency_id: agency.id, name, website: website || null })
    .select('id, name')
    .single()
  if (!account) {
    redirect(
      `/dashboard/onboarding/new-client?price_id=${encodeURIComponent(priceId)}&error=` +
        encodeURIComponent('Could not create the account. Please try again.')
    )
  }

  if (agency.clickup_folder_id) {
    const list = await createList(agency.clickup_folder_id, account!.name)
    if (list) await admin.from('accounts').update({ clickup_list_id: list.id }).eq('id', account!.id)
  }

  // The signup subscription was created with no account yet -- find it
  // (agency + price, still unattached) and link it now.
  const { data: sub } = await admin
    .from('subscriptions')
    .select('id, stripe_subscription_id')
    .eq('agency_id', agency.id)
    .eq('stripe_price_id', priceId)
    .is('account_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sub) {
    await admin.from('subscriptions').update({ account_id: account!.id }).eq('id', sub.id)
    if (sub.stripe_subscription_id) {
      await stripe.subscriptions
        .update(sub.stripe_subscription_id, {
          metadata: { agency_id: agency.id, account_id: account!.id, account_name: account!.name },
        })
        .catch(() => {})
    }
  }

  redirect(`/dashboard/onboarding/${priceId}?account_id=${account!.id}`)
}
