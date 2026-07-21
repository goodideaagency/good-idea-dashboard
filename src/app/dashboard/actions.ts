'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

// Adds a service (subscription) for the logged-in agency and sends them to
// Stripe Checkout to pay for it. The service is attached either to an EXISTING
// client account (account_id) or to a NEW one created from name/website. Every
// subscription lands on the agency's ONE Stripe customer, tagged with the
// account it belongs to.
export async function addServiceAndCheckout(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('agency_users')
    .select('agency_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')

  const priceId = String(formData.get('priceId') || '').trim()
  if (!priceId) redirect('/dashboard')

  const existingAccountId = String(formData.get('account_id') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()

  const admin = createAdminClient()

  // 1. Ensure this agency has exactly ONE Stripe customer.
  const { data: agency } = await admin
    .from('agencies')
    .select('id, name, stripe_customer_id')
    .eq('id', membership.agency_id)
    .single()
  if (!agency) redirect('/dashboard')

  let customerId = agency.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: agency.name,
      email: user.email ?? undefined,
      metadata: { agency_id: agency.id },
    })
    customerId = customer.id
    await admin
      .from('agencies')
      .update({ stripe_customer_id: customerId })
      .eq('id', agency.id)
  }

  // 2. Resolve the target account: an existing one (ownership enforced by RLS)
  //    or a brand-new one created from the submitted name/website.
  let accountId: string
  let returnTo = '/dashboard'
  if (existingAccountId) {
    const { data: acct } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', existingAccountId)
      .maybeSingle()
    if (!acct) redirect('/dashboard')
    accountId = acct.id
    returnTo = `/dashboard/accounts/${accountId}`
  } else {
    if (!name) redirect('/dashboard')
    const { data: account } = await admin
      .from('accounts')
      .insert({ agency_id: agency.id, name, website: website || null })
      .select('id')
      .single()
    if (!account) redirect('/dashboard')
    accountId = account.id
    returnTo = `/dashboard/accounts/${accountId}`
  }

  // 3. Start a Checkout Session tied to that customer + account.
  const origin =
    (await headers()).get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { account_id: accountId, agency_id: agency.id },
    },
    metadata: { account_id: accountId, agency_id: agency.id },
    success_url: `${origin}/dashboard/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${returnTo}`,
  })

  if (session.url) redirect(session.url)
  redirect(returnTo)
}
