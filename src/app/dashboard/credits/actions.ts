'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import {
  ensureAgencyStripeCustomer,
  setSubscriptionCancelation,
  changeSubscriptionPrice,
} from '@/lib/subscriptions'
import { agencyIsCreditEligible, getActiveCreditSubscription } from '@/lib/credits'

// Both actions below resolve the caller's own active credit subscription
// server-side from their agency membership -- neither trusts a
// client-submitted subscription id for WHICH subscription to act on, so
// there's no way to act on another agency's plan even by guessing an id.
async function requireOwnActiveCreditSubscription() {
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

  const activeSub = await getActiveCreditSubscription(membership.agency_id as string)
  if (!activeSub) redirect('/dashboard/credits')
  return activeSub
}

// Cancels (schedules cancel_at_period_end) or restarts the caller's own
// credit plan -- same cancel-at-period-end behavior as a managed service
// subscription (see setSubscriptionCancelation).
export async function updateCreditPlanCancelation(formData: FormData) {
  const activeSub = await requireOwnActiveCreditSubscription()
  const intent = String(formData.get('intent') || '')
  await setSubscriptionCancelation(activeSub.stripeSubscriptionId, intent === 'cancel')
  revalidatePath('/dashboard/credits')
  revalidatePath('/dashboard/credits/change-plan')
}

// Upgrades/downgrades the caller's own credit plan to a different
// credit-granting price -- rejects anything that isn't actually one (an
// arbitrary/managed-service price id submitted by a tampered request).
export async function switchCreditPlan(formData: FormData) {
  const activeSub = await requireOwnActiveCreditSubscription()

  const newPriceId = String(formData.get('price_id') || '').trim()
  if (!newPriceId || newPriceId === activeSub.priceId) redirect('/dashboard/credits/change-plan')

  const price = await stripe.prices.retrieve(newPriceId, { expand: ['product'] }).catch(() => null)
  const product = price?.product as Stripe.Product | undefined
  const isCreditPlan = Number(product?.metadata?.credits_per_cycle ?? 0) > 0
  if (!isCreditPlan) redirect('/dashboard/credits/change-plan')

  await changeSubscriptionPrice(activeSub.stripeSubscriptionId, newPriceId)
  revalidatePath('/dashboard/credits')
  redirect('/dashboard/credits')
}

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
