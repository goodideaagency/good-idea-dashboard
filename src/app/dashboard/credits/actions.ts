'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { ensureAgencyStripeCustomer } from '@/lib/subscriptions'
import { agencyIsCreditEligible } from '@/lib/credits'

// Starts a one-time Checkout Session for a credit top-up product. Credits
// are granted by the Stripe webhook (checkout.session.completed) once
// payment actually clears -- this action only sends the buyer to pay.
export async function buyCreditTopup(formData: FormData) {
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
  if (!membership) redirect('/dashboard/credits')

  const priceId = String(formData.get('priceId') || '').trim()
  if (!priceId) redirect('/dashboard/credits')

  const admin = createAdminClient()
  const { data: agency } = await admin
    .from('agencies')
    .select('id, name, stripe_customer_id')
    .eq('id', membership.agency_id)
    .single()
  if (!agency) redirect('/dashboard/credits')

  // Top-ups are only for agencies actively on a credit-granting plan --
  // don't let a lapsed agency buy credits they'd have no plan left to use.
  if (!(await agencyIsCreditEligible(agency.id))) redirect('/dashboard/credits')

  const customerId = await ensureAgencyStripeCustomer(admin, agency, user.email ?? undefined)

  const origin =
    (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { agency_id: agency.id, agency_name: agency.name, credit_topup: 'true' },
    success_url: `${origin}/dashboard/credits/topup-return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/credits`,
  })

  if (session.url) redirect(session.url)
  redirect('/dashboard/credits')
}
