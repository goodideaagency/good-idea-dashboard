'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

// Adds a new client account for the logged-in agency, then sends them to
// Stripe Checkout to subscribe it to a plan. The subscription is created on
// the agency's ONE Stripe customer and tagged with the account it belongs to.
export async function addAccountAndCheckout(formData: FormData) {
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

  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim()
  const priceId = String(formData.get('priceId') || '').trim()
  if (!name || !priceId) redirect('/dashboard')

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

  // 2. Create the account record.
  const { data: account } = await admin
    .from('accounts')
    .insert({ agency_id: agency.id, name, website: website || null })
    .select('id')
    .single()
  if (!account) redirect('/dashboard')

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
      metadata: { account_id: account.id, agency_id: agency.id },
    },
    metadata: { account_id: account.id, agency_id: agency.id },
    success_url: `${origin}/dashboard/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard`,
  })

  if (session.url) redirect(session.url)
  redirect('/dashboard')
}
