import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { revalidatePath } from 'next/cache'
import { stripe } from '@/lib/stripe'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'
import { createAdminClient } from '@/lib/supabase/admin'
import { forfeitAgencyCredits, grantAgencyCredits, grantTopupCredits } from '@/lib/credits'
import { provisionSignupAgency } from '@/lib/signup'

// Only these billing reasons grant credits -- 'subscription_create' is the
// first invoice (signup), 'subscription_cycle' is a renewal. Other reasons
// (proration from a plan change, etc.) don't, so switching plans mid-cycle
// never double-grants.
const GRANT_SOURCE: Record<string, 'subscription_initial' | 'subscription_renewal'> = {
  subscription_create: 'subscription_initial',
  subscription_cycle: 'subscription_renewal',
}

// Stripe calls this endpoint whenever something changes. We verify the
// signature (so only real Stripe requests are accepted), then keep our
// subscription records in sync — renewals, cancellations, failed payments, etc.
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !secret) {
    return new NextResponse('Missing signature or secret', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new NextResponse('Invalid signature', { status: 400 })
  }

  try {
    if (event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object as Stripe.Subscription
      await upsertSubscriptionFromStripe(sub)

      // Credits are agency-scoped and keep their normal lifecycle on a
      // single cancellation/downgrade -- but if the agency now has zero
      // active subscriptions at all, the whole relationship ended, and per
      // policy any remaining credits are forfeited.
      //
      // Only treat THIS subscription as having genuinely ended if its
      // status is a terminal one -- 'past_due'/'unpaid'/'incomplete' are
      // Stripe's recoverable dunning states (Smart Retries can run for
      // weeks before an actual cancellation), and this handler fires on
      // every customer.subscription.updated, including the moment a card
      // first fails. Forfeiting here on a recoverable status would zero an
      // agency's credits the instant their card fails, with no way back
      // even if they fix it the same day -- confirmed this was possible
      // before this fix, via code review ahead of Digitac/Pixan going live.
      const relationshipMayHaveEnded = sub.status === 'canceled' || sub.status === 'incomplete_expired'
      const agencyId = sub.metadata?.agency_id
      if (agencyId && relationshipMayHaveEnded) {
        const admin = createAdminClient()
        const { count } = await admin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('agency_id', agencyId)
          .in('status', ['active', 'trialing'])
        if ((count ?? 0) === 0) {
          await forfeitAgencyCredits(agencyId)
          revalidatePath('/dashboard', 'layout')
        }
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.mode === 'subscription' && session.metadata?.signup === 'true') {
        // Primary path for turning a signup checkout into a real agency --
        // the checkout return page also calls this (idempotent) as a
        // fallback in case this event is delayed or never delivered.
        await provisionSignupAgency(session)
      }

      if (session.mode === 'payment' && session.metadata?.credit_topup === 'true') {
        // Primary path for a credit top-up purchase -- the checkout return
        // page also calls this (idempotent, on the session id) as a
        // fallback in case this event is delayed or never delivered. Before
        // this fallback existed, a lost webhook here meant real money
        // charged with no credits ever granted and nothing to catch it.
        await grantTopupCredits(session)
        revalidatePath('/dashboard', 'layout')
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const source = GRANT_SOURCE[invoice.billing_reason ?? '']
      // As of API version 2025-03-31.basil, invoices no longer have a
      // top-level `subscription` field -- it moved under
      // parent.subscription_details.subscription. Reading the old field
      // silently returned undefined here, which meant this whole block was
      // a no-op for every invoice: no error, no retry, just no credits ever
      // granted -- confirmed live on the "Good Buddies" signup.
      const invoiceSub = invoice.parent?.subscription_details?.subscription
      const subId = typeof invoiceSub === 'string' ? invoiceSub : invoiceSub?.id

      if (source && subId) {
        const subscription = await stripe.subscriptions.retrieve(subId, {
          expand: ['items.data.price.product'],
        })
        const agencyId = subscription.metadata?.agency_id
        const product = subscription.items.data[0]?.price?.product as Stripe.Product | undefined
        const creditsPerCycle = Number(product?.metadata?.credits_per_cycle ?? 0)

        if (creditsPerCycle > 0 && !agencyId) {
          // For a brand-new signup, this subscription's agency_id gets
          // tagged by provisionSignupAgency in response to a SEPARATE event
          // (checkout.session.completed), and Stripe doesn't guarantee that
          // arrives before this one. Rather than silently losing the grant,
          // fail so Stripe retries this delivery later -- by then tagging
          // has almost certainly happened.
          throw new Error(`invoice.paid for ${subId}: credits-granting subscription has no agency_id yet`)
        }

        if (agencyId && creditsPerCycle > 0) {
          await grantAgencyCredits(agencyId, creditsPerCycle, source, {
            stripeEventId: event.id,
            note: `${product?.name ?? 'Subscription'} — ${invoice.billing_reason}`,
          })
          revalidatePath('/dashboard', 'layout')
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new NextResponse('Handler error', { status: 500 })
  }

  return NextResponse.json({ received: true })
}
