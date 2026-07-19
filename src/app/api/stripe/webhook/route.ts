import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'

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
      await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription)
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new NextResponse('Handler error', { status: 500 })
  }

  return NextResponse.json({ received: true })
}
