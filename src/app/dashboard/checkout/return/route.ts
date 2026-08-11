import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { upsertSubscriptionFromStripe } from '@/lib/subscriptions'
import { getManagedServiceByPriceId } from '@/lib/service-catalog'

// Stripe sends the customer back here after a successful checkout. We verify
// the session with Stripe, record the subscription (shared helper), then:
//   1. if the purchased price maps to a ManagedServiceDef, forward to that
//      service's in-platform intake form (the new, primary path);
//   2. else fall back to the product's `onboarding_url` metadata, for any
//      plan not yet migrated to the new flow;
//   3. else the dashboard. The buyer is never left on a blank page.
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const priceId: string | undefined = (sub.items.data[0] as any)?.price?.id
      const accountId = sub.metadata?.account_id
      const managedService = priceId ? getManagedServiceByPriceId(priceId) : undefined

      if (managedService && accountId) {
        const url = new URL(`/dashboard/onboarding/${managedService.priceId}`, request.url)
        url.searchParams.set('account_id', accountId)
        destination = url.toString()
      } else if (onboardingUrl) {
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
