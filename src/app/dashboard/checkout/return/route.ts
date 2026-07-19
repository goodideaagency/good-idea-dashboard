import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'

// Stripe sends the customer back here after a successful checkout. We verify
// the session with Stripe, record the subscription (shared helper), then
// forward the buyer to the product's onboarding page (Stripe product metadata
// `onboarding_url`). If no onboarding URL is set, or anything goes wrong, we
// fall back to the dashboard — the buyer is never left on a blank page.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  const dashboardUrl = new URL('/dashboard', request.url)
  let destination = dashboardUrl.toString()

  try {
    if (!sessionId) return NextResponse.redirect(dashboardUrl)

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'subscription.items.data.price'],
    })

    const sub = session.subscription
    const paid = session.status === 'complete' || session.payment_status === 'paid'

    if (paid && sub && typeof sub !== 'string') {
      const { onboardingUrl } = await upsertSubscriptionFromStripe(sub)

      // Forward to the product's onboarding page, if one is configured.
      if (onboardingUrl) {
        try {
          const url = new URL(onboardingUrl)
          // Pass the checkout session id along so the onboarding page can tie
          // the form back to this purchase (safe to ignore if unused).
          url.searchParams.set('session_id', session.id)
          destination = url.toString()
        } catch {
          destination = dashboardUrl.toString()
        }
      }
    }
  } catch (err) {
    console.error('checkout return error:', err)
  }

  return NextResponse.redirect(destination)
}
