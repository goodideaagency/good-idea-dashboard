import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'
import { createAdminClient } from '@/lib/supabase/admin'
import { forfeitAgencyCredits, grantAgencyCredits } from '@/lib/credits'

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
      const agencyId = sub.metadata?.agency_id
      if (agencyId) {
        const admin = createAdminClient()
        const { count } = await admin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('agency_id', agencyId)
          .in('status', ['active', 'trialing'])
        if ((count ?? 0) === 0) {
          await forfeitAgencyCredits(agencyId)
        }
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const source = GRANT_SOURCE[invoice.billing_reason ?? '']
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoiceSub = (invoice as any).subscription as string | { id: string } | null | undefined
      const subId = typeof invoiceSub === 'string' ? invoiceSub : invoiceSub?.id

      if (source && subId) {
        const subscription = await stripe.subscriptions.retrieve(subId, {
          expand: ['items.data.price.product'],
        })
        const agencyId = subscription.metadata?.agency_id
        const product = subscription.items.data[0]?.price?.product as Stripe.Product | undefined
        const creditsPerCycle = Number(product?.metadata?.credits_per_cycle ?? 0)

        if (agencyId && creditsPerCycle > 0) {
          await grantAgencyCredits(agencyId, creditsPerCycle, source, {
            stripeEventId: event.id,
            note: `${product?.name ?? 'Subscription'} — ${invoice.billing_reason}`,
          })
        }
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new NextResponse('Handler error', { status: 500 })
  }

  return NextResponse.json({ received: true })
}
